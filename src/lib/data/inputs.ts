import { assess } from "@/lib/rules/engine";
import type { Assessment, RuleSettings, SkuInput } from "@/lib/rules/types";
import { windowBefore } from "@/lib/rules/weeks";
import type { Dataset } from "./csv";

export const HISTORY_SLOTS = 16;

/** Latest As_Of_Date in the stock file. */
export function asOfDateOf(ds: Dataset): string {
  return ds.inventory.map((r) => r.asOfDate).sort().at(-1)!;
}

/**
 * Turns an uploaded snapshot into one engine input per SKU.
 * `openOrders` maps SKU_ID to open Zoho quantity; pass null while Zoho is not connected.
 * The festival flag comes from the month of the stock date, so old cycles can be reproduced.
 */
export function buildInputs(
  ds: Dataset,
  openOrders: Record<string, number> | null,
): { asOfDate: string; weekLabels: string[]; inputs: SkuInput[] } {
  const asOfDate = asOfDateOf(ds);
  const weekLabels = windowBefore(asOfDate, HISTORY_SLOTS);
  const isFestival = ds.calendar.find((c) => c.yearMonth === asOfDate.slice(0, 7))?.festival ?? false;
  const activeSupplier = new Map(ds.distributors.map((d) => [d.distributorId, d.active]));

  const salesBySku = new Map<string, Map<string, number>>();
  for (const r of ds.sales) {
    if (!salesBySku.has(r.skuId)) salesBySku.set(r.skuId, new Map());
    salesBySku.get(r.skuId)!.set(r.week, r.units);
  }
  const stock = new Map<string, number>();
  for (const r of ds.inventory) stock.set(r.skuId, (stock.get(r.skuId) ?? 0) + r.units);

  const inputs: SkuInput[] = ds.skus.map((s) => {
    const sales = salesBySku.get(s.skuId);
    return {
      skuId: s.skuId,
      skuName: s.name,
      perishability: s.perishability,
      standardReorderQty: s.standardReorderQty,
      weeks: weekLabels.map((w) => sales?.get(w) ?? null),
      stockOnHand: stock.get(s.skuId) ?? 0,
      openOrderQty: openOrders === null ? null : (openOrders[s.skuId] ?? 0),
      isFestivalMonth: isFestival,
      supplierActive: activeSupplier.get(s.distributorId) ?? false,
    };
  });
  return { asOfDate, weekLabels, inputs };
}

export function assessAll(
  ds: Dataset,
  settings: RuleSettings,
  openOrders: Record<string, number> | null,
): { asOfDate: string; weekLabels: string[]; inputs: SkuInput[]; results: Assessment[] } {
  const built = buildInputs(ds, openOrders);
  return { ...built, results: built.inputs.map((i) => assess(i, settings)) };
}
