import Papa from "papaparse";
import { isoDateToTs, parseWeek } from "@/lib/rules/weeks";
import type { Perishability } from "@/lib/rules/types";

export type FileKey = "sku_master" | "distributor_master" | "weekly_sales" | "current_inventory" | "calendar";

export const FILE_COLUMNS: Record<FileKey, string[]> = {
  sku_master: ["SKU_ID", "SKU_Name", "Category", "Perishability", "Standard_Reorder_Qty", "Unit_of_Measure", "Distributor_ID"],
  distributor_master: ["Distributor_ID", "Distributor_Name", "Region", "Status"],
  weekly_sales: ["SKU_ID", "Week", "Units_Sold"],
  current_inventory: ["SKU_ID", "Location", "Units_On_Hand", "As_Of_Date"],
  calendar: ["Year", "Month", "Year_Month", "Is_Festival_Month"],
};

export type SkuRow = {
  skuId: string;
  name: string;
  category: string;
  perishability: Perishability;
  standardReorderQty: number;
  unit: string;
  distributorId: string;
};
export type DistributorRow = { distributorId: string; name: string; region: string; active: boolean };
export type SaleRow = { skuId: string; week: string; units: number };
export type InventoryRow = { skuId: string; location: string; units: number; asOfDate: string };
export type CalendarRow = { yearMonth: string; festival: boolean };

export type Dataset = {
  skus: SkuRow[];
  distributors: DistributorRow[];
  sales: SaleRow[];
  inventory: InventoryRow[];
  calendar: CalendarRow[];
};

export type Problem = { file: FileKey; row?: number; message: string };
export type ValidationResult = {
  /** Anything here blocks the upload. */
  errors: Problem[];
  /** Saved, but Raghav should know. */
  warnings: Problem[];
  dataset: Dataset | null;
};

type Raw = Record<string, string>;

function parse(file: FileKey, text: string, errors: Problem[]): Raw[] | null {
  const res = Papa.parse<Raw>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
    transform: (v) => v.trim(),
  });
  const found = res.meta.fields ?? [];
  const missing = FILE_COLUMNS[file].filter((c) => !found.includes(c));
  if (missing.length) {
    errors.push({
      file,
      message: `The ${file}.csv file is missing the column${missing.length > 1 ? "s" : ""} ${missing.join(", ")}. It needs exactly these columns: ${FILE_COLUMNS[file].join(", ")}.`,
    });
    return null;
  }
  return res.data;
}

const isWholeNumber = (v: string) => /^-?\d+$/.test(v);
// Spreadsheet row number: header is row 1, first data row is row 2.
const rowNo = (i: number) => i + 2;

/**
 * Checks the uploaded CSVs and explains every problem in plain English.
 * `fallback` supplies the files that were not uploaded this time (for a weekly sales + stock refresh).
 */
export function validateUpload(
  files: Partial<Record<FileKey, string>>,
  fallback?: Partial<Dataset>,
): ValidationResult {
  const errors: Problem[] = [];
  const warnings: Problem[] = [];

  // ---- sku_master
  let skus: SkuRow[] | undefined = fallback?.skus;
  if (files.sku_master !== undefined) {
    const raw = parse("sku_master", files.sku_master, errors);
    if (raw) {
      const seen = new Set<string>();
      const rows: SkuRow[] = [];
      raw.forEach((r, i) => {
        const n = rowNo(i);
        if (!r.SKU_ID) return void errors.push({ file: "sku_master", row: n, message: `Row ${n} has no SKU_ID.` });
        if (seen.has(r.SKU_ID)) return void errors.push({ file: "sku_master", row: n, message: `${r.SKU_ID} appears twice in sku_master (row ${n}).` });
        seen.add(r.SKU_ID);
        const per = ["High", "Medium", "Low"].find((p) => p.toLowerCase() === r.Perishability.toLowerCase());
        if (!per) errors.push({ file: "sku_master", row: n, message: `${r.SKU_ID}: Perishability "${r.Perishability}" must be High, Medium or Low.` });
        const qty = Number(r.Standard_Reorder_Qty);
        if (!isWholeNumber(r.Standard_Reorder_Qty) || qty <= 0) {
          errors.push({ file: "sku_master", row: n, message: `${r.SKU_ID}: Standard_Reorder_Qty "${r.Standard_Reorder_Qty}" must be a whole number above zero.` });
        }
        rows.push({
          skuId: r.SKU_ID, name: r.SKU_Name, category: r.Category,
          perishability: (per ?? "Low") as Perishability, standardReorderQty: qty,
          unit: r.Unit_of_Measure, distributorId: r.Distributor_ID,
        });
      });
      skus = rows;
    }
  }

  // ---- distributor_master
  let distributors: DistributorRow[] | undefined = fallback?.distributors;
  if (files.distributor_master !== undefined) {
    const raw = parse("distributor_master", files.distributor_master, errors);
    if (raw) {
      const seen = new Set<string>();
      const rows: DistributorRow[] = [];
      raw.forEach((r, i) => {
        const n = rowNo(i);
        if (!r.Distributor_ID) return void errors.push({ file: "distributor_master", row: n, message: `Row ${n} has no Distributor_ID.` });
        if (seen.has(r.Distributor_ID)) return void errors.push({ file: "distributor_master", row: n, message: `${r.Distributor_ID} appears twice in distributor_master (row ${n}).` });
        seen.add(r.Distributor_ID);
        const st = r.Status.toLowerCase();
        if (st !== "active" && st !== "inactive") {
          errors.push({ file: "distributor_master", row: n, message: `${r.Distributor_ID}: Status "${r.Status}" must be Active or Inactive.` });
        }
        rows.push({ distributorId: r.Distributor_ID, name: r.Distributor_Name, region: r.Region, active: st === "active" });
      });
      distributors = rows;
    }
  }

  if (!skus && !errors.some((e) => e.file === "sku_master")) {
    errors.push({ file: "sku_master", message: "There is no SKU list yet. Please upload sku_master.csv." });
  }
  if (!distributors && !errors.some((e) => e.file === "distributor_master")) {
    errors.push({ file: "distributor_master", message: "There is no supplier list yet. Please upload distributor_master.csv." });
  }
  const skuIds = new Set((skus ?? []).map((s) => s.skuId));
  const distIds = new Set((distributors ?? []).map((d) => d.distributorId));

  for (const s of skus ?? []) {
    if (distributors && !distIds.has(s.distributorId)) {
      errors.push({ file: "sku_master", message: `${s.skuId} uses supplier ${s.distributorId || "(blank)"}, which is not in distributor_master.` });
    }
  }

  // ---- weekly_sales
  let sales: SaleRow[] | undefined = fallback?.sales;
  if (files.weekly_sales !== undefined) {
    const raw = parse("weekly_sales", files.weekly_sales, errors);
    if (raw) {
      const seen = new Set<string>();
      const unknown = new Set<string>();
      const rows: SaleRow[] = [];
      raw.forEach((r, i) => {
        const n = rowNo(i);
        if (!r.SKU_ID) return void errors.push({ file: "weekly_sales", row: n, message: `Row ${n} has no SKU_ID.` });
        if (!parseWeek(r.Week)) return void errors.push({ file: "weekly_sales", row: n, message: `${r.SKU_ID}: Week "${r.Week}" should look like 2026-W27 (row ${n}).` });
        if (!isWholeNumber(r.Units_Sold)) return void errors.push({ file: "weekly_sales", row: n, message: `${r.SKU_ID} ${r.Week}: Units_Sold "${r.Units_Sold}" must be a whole number (row ${n}).` });
        const units = Number(r.Units_Sold);
        if (units < 0) return void errors.push({ file: "weekly_sales", row: n, message: `${r.SKU_ID} ${r.Week}: Units_Sold is negative (${units}) in row ${n}.` });
        const key = `${r.SKU_ID}|${r.Week}`;
        if (seen.has(key)) return void errors.push({ file: "weekly_sales", row: n, message: `${r.SKU_ID} has ${r.Week} twice (row ${n}). Each SKU can have only one row per week.` });
        seen.add(key);
        if (skus && !skuIds.has(r.SKU_ID)) {
          unknown.add(r.SKU_ID);
          return;
        }
        rows.push({ skuId: r.SKU_ID, week: r.Week, units });
      });
      for (const id of unknown) {
        warnings.push({ file: "weekly_sales", message: `${id} has sales but is not in sku_master. Its sales were ignored. Add it to sku_master if it should be tracked.` });
      }
      sales = rows;
    }
  }

  // ---- current_inventory
  let inventory: InventoryRow[] | undefined = fallback?.inventory;
  if (files.current_inventory !== undefined) {
    const raw = parse("current_inventory", files.current_inventory, errors);
    if (raw) {
      const seen = new Set<string>();
      const rows: InventoryRow[] = [];
      raw.forEach((r, i) => {
        const n = rowNo(i);
        if (!r.SKU_ID) return void errors.push({ file: "current_inventory", row: n, message: `Row ${n} has no SKU_ID.` });
        if (isoDateToTs(r.As_Of_Date) === null) return void errors.push({ file: "current_inventory", row: n, message: `${r.SKU_ID}: As_Of_Date "${r.As_Of_Date}" should look like 2026-10-19 (row ${n}).` });
        if (!isWholeNumber(r.Units_On_Hand)) return void errors.push({ file: "current_inventory", row: n, message: `${r.SKU_ID}: Units_On_Hand "${r.Units_On_Hand}" must be a whole number (row ${n}).` });
        const units = Number(r.Units_On_Hand);
        if (units < 0) return void errors.push({ file: "current_inventory", row: n, message: `${r.SKU_ID}: stock is negative (${units}) in row ${n}. Stock cannot be below zero.` });
        const key = `${r.SKU_ID}|${r.Location}`;
        if (seen.has(key)) return void errors.push({ file: "current_inventory", row: n, message: `${r.SKU_ID} is listed twice for ${r.Location} (row ${n}).` });
        seen.add(key);
        if (skus && !skuIds.has(r.SKU_ID)) {
          return void errors.push({ file: "current_inventory", row: n, message: `${r.SKU_ID} has stock but is not in sku_master (row ${n}).` });
        }
        rows.push({ skuId: r.SKU_ID, location: r.Location, units, asOfDate: r.As_Of_Date });
      });
      const dates = new Set(rows.map((r) => r.asOfDate));
      if (dates.size > 1) {
        warnings.push({ file: "current_inventory", message: `The stock file has more than one As_Of_Date (${[...dates].sort().join(", ")}). The latest will be used.` });
      }
      inventory = rows;
    }
  }
  // Only list "no stock row" when the stock file itself had no other problems; a bad row would otherwise be reported twice.
  if (inventory && skus && !errors.some((e) => e.file === "current_inventory")) {
    const have = new Set(inventory.map((r) => r.skuId));
    for (const s of skus) {
      if (!have.has(s.skuId)) {
        errors.push({ file: "current_inventory", message: `${s.skuId} (${s.name}) has no stock row. Add it, even if stock is 0.` });
      }
    }
  }

  // ---- calendar
  let calendar: CalendarRow[] | undefined = fallback?.calendar;
  if (files.calendar !== undefined) {
    const raw = parse("calendar", files.calendar, errors);
    if (raw) {
      const rows: CalendarRow[] = [];
      raw.forEach((r, i) => {
        const n = rowNo(i);
        const flag = r.Is_Festival_Month.toUpperCase();
        if (flag !== "TRUE" && flag !== "FALSE") {
          return void errors.push({ file: "calendar", row: n, message: `${r.Year_Month}: Is_Festival_Month "${r.Is_Festival_Month}" must be TRUE or FALSE (row ${n}).` });
        }
        if (!/^\d{4}-\d{2}$/.test(r.Year_Month)) {
          return void errors.push({ file: "calendar", row: n, message: `Year_Month "${r.Year_Month}" should look like 2026-10 (row ${n}).` });
        }
        rows.push({ yearMonth: r.Year_Month, festival: flag === "TRUE" });
      });
      calendar = rows;
    }
  }

  // The stock date's month must be in the calendar, or we cannot tell if it is a festival month.
  if (calendar && inventory?.length) {
    const asOf = inventory.map((r) => r.asOfDate).sort().at(-1)!;
    if (!calendar.some((c) => c.yearMonth === asOf.slice(0, 7))) {
      errors.push({ file: "calendar", message: `The calendar has no row for ${asOf.slice(0, 7)}, the month of your stock date. Add it so we know if it is a festival month.` });
    }
  } else if (!calendar && !errors.some((e) => e.file === "calendar")) {
    errors.push({ file: "calendar", message: "There is no calendar yet. Please upload calendar.csv." });
  }
  if (!sales && !errors.some((e) => e.file === "weekly_sales")) {
    errors.push({ file: "weekly_sales", message: "There are no sales yet. Please upload weekly_sales.csv." });
  }
  if (!inventory && !errors.some((e) => e.file === "current_inventory")) {
    errors.push({ file: "current_inventory", message: "There is no stock yet. Please upload current_inventory.csv." });
  }

  if (errors.length || !skus || !distributors || !sales || !inventory || !calendar) {
    return { errors, warnings, dataset: null };
  }
  return { errors, warnings, dataset: { skus, distributors, sales, inventory, calendar } };
}
