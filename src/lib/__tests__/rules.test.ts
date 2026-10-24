import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { assess } from "@/lib/rules/engine";
import { DEFAULT_RULES } from "@/lib/rules/defaults";
import { validateUpload, type FileKey } from "@/lib/data/csv";
import { assessAll } from "@/lib/data/inputs";
import { windowBefore, weekLabelOf } from "@/lib/rules/weeks";
import type { SkuInput } from "@/lib/rules/types";

const read = (k: FileKey) => readFileSync(path.join(__dirname, "../../../data/sample", `${k}.csv`), "utf8");
const sampleFiles = {
  sku_master: read("sku_master"),
  distributor_master: read("distributor_master"),
  weekly_sales: read("weekly_sales"),
  current_inventory: read("current_inventory"),
  calendar: read("calendar"),
};

describe("sample data (stock snapshot 19 Oct 2026, October is a festival month)", () => {
  const v = validateUpload(sampleFiles);
  it("is accepted with no errors", () => {
    expect(v.errors).toEqual([]);
    expect(v.dataset).not.toBeNull();
  });
  const { results, weekLabels } = assessAll(v.dataset!, DEFAULT_RULES, null);
  const by = Object.fromEntries(results.map((r) => [r.skuId, r]));

  it("uses the 16 weeks 2026-W27 to W42", () => {
    expect(weekLabels[0]).toBe("2026-W27");
    expect(weekLabels[15]).toBe("2026-W42");
  });

  it("flags exactly the expected stockout SKUs", () => {
    const ids = results.filter((r) => r.status === "stockout").map((r) => r.skuId);
    expect(ids.sort()).toEqual(["SKU001", "SKU003", "SKU004", "SKU011", "SKU013"]);
  });

  it("flags exactly the expected overstock SKUs", () => {
    const ids = results.filter((r) => r.status === "overstock").map((r) => r.skuId);
    expect(ids.sort()).toEqual(["SKU006", "SKU007"]);
  });

  it("marks the rest OK and none as needs judgment", () => {
    const ok = results.filter((r) => r.status === "ok").map((r) => r.skuId);
    expect(ok.sort()).toEqual(["SKU002", "SKU005", "SKU008", "SKU009", "SKU010", "SKU012", "SKU014", "SKU015"]);
    expect(results.some((r) => r.status === "needs_judgment")).toBe(false);
  });

  it("SKU001: 3.4 weeks, high demand, order 750, 6.1 after, no warning", () => {
    expect(by.SKU001.weeksOfCover).toBeCloseTo(3.4, 1);
    expect(by.SKU001.highDemand).toBe(true);
    expect(by.SKU001.reorderQty).toBe(750);
    expect(by.SKU001.weeksOfCoverAfter).toBeCloseTo(6.1, 1);
    expect(by.SKU001.warning).toBeNull();
  });

  it("SKU003: 4.4 weeks, order 300, 5.95 after, amber warning", () => {
    expect(by.SKU003.weeksOfCover).toBeCloseTo(4.4, 1);
    expect(by.SKU003.reorderQty).toBe(300);
    expect(by.SKU003.weeksOfCoverAfter).toBeCloseTo(5.95, 2);
    expect(by.SKU003.warning).not.toBeNull();
  });

  it("SKU004 Almond Milk: 1.8 weeks, perishable, order 150, 3.3 after", () => {
    expect(by.SKU004.perishable).toBe(true);
    expect(by.SKU004.weeksOfCover).toBeCloseTo(1.8, 1);
    expect(by.SKU004.reorderQty).toBe(150);
    expect(by.SKU004.weeksOfCoverAfter).toBeCloseTo(3.3, 1);
    expect(by.SKU004.warning).toBeNull();
  });

  it("SKU011 Multigrain Bread: 1.8 weeks, perishable, order 500, 3.8 after", () => {
    expect(by.SKU011.perishable).toBe(true);
    expect(by.SKU011.weeksOfCover).toBeCloseTo(1.8, 1);
    expect(by.SKU011.reorderQty).toBe(500);
    expect(by.SKU011.weeksOfCoverAfter).toBeCloseTo(3.8, 1);
    expect(by.SKU011.warning).toBeNull();
  });

  it("SKU013: 3.2 weeks, order 120, 5.3 after, amber warning", () => {
    expect(by.SKU013.weeksOfCover).toBeCloseTo(3.2, 1);
    expect(by.SKU013.reorderQty).toBe(120);
    expect(by.SKU013.weeksOfCoverAfter).toBeCloseTo(5.3, 1);
    expect(by.SKU013.warning).not.toBeNull();
  });

  it("SKU006 Quinoa: 22.2 weeks overstock, no order", () => {
    expect(by.SKU006.weeksOfCover).toBeCloseTo(22.2, 1);
    expect(by.SKU006.reorderQty).toBeNull();
  });

  it("SKU007 Coconut Water: 4.1 weeks is over the perishable cap of 4", () => {
    expect(by.SKU007.perishable).toBe(true);
    expect(by.SKU007.weeksOfCover).toBeCloseTo(4.1, 1);
    expect(by.SKU007.status).toBe("overstock");
  });

  it("only SKU001 is high demand", () => {
    expect(results.filter((r) => r.highDemand).map((r) => r.skuId)).toEqual(["SKU001"]);
  });
});

function sku(over: Partial<SkuInput> = {}): SkuInput {
  return {
    skuId: "T1",
    skuName: "Test",
    perishability: "Low",
    standardReorderQty: 100,
    weeks: Array(16).fill(100),
    stockOnHand: 1000,
    openOrderQty: 0,
    isFestivalMonth: false,
    supplierActive: true,
    ...over,
  };
}

describe("rule edge cases", () => {
  it("festival uplift changes cover but not the high-demand check", () => {
    // recent avg 115 vs long avg 100 is only 15% up, so not high demand, with or without uplift.
    const weeks = [...Array(12).fill(100), 115, 115, 115, 115];
    const plain = assess(sku({ weeks, stockOnHand: 1200 }), DEFAULT_RULES);
    const fest = assess(sku({ weeks, stockOnHand: 1200, isFestivalMonth: true }), DEFAULT_RULES);
    expect(plain.highDemand).toBe(false);
    expect(fest.highDemand).toBe(false);
    expect(fest.weeksOfCover!).toBeLessThan(plain.weeksOfCover!);
  });

  it("an OK SKU can carry the high-demand tag without an order", () => {
    const weeks = [...Array(12).fill(100), 140, 140, 140, 140];
    const r = assess(sku({ weeks, stockOnHand: 1000 }), DEFAULT_RULES);
    expect(r.highDemand).toBe(true);
    expect(r.status).toBe("ok");
    expect(r.reorderQty).toBeNull();
  });

  it("open Zoho orders count towards cover", () => {
    const base = sku({ stockOnHand: 300 }); // 3 weeks
    expect(assess(base, DEFAULT_RULES).status).toBe("stockout");
    expect(assess({ ...base, openOrderQty: 500 }, DEFAULT_RULES).status).toBe("ok");
  });

  it("Zoho not connected counts as 0 and says so", () => {
    const r = assess(sku({ stockOnHand: 300, openOrderQty: null }), DEFAULT_RULES);
    expect(r.flags.map((f) => f.code)).toContain("zoho_not_connected");
    expect(r.status).toBe("stockout");
  });

  it("fewer than 12 weeks of history needs judgment and gives no number", () => {
    const weeks = [...Array(6).fill(null), ...Array(10).fill(100)];
    const r = assess(sku({ weeks }), DEFAULT_RULES);
    expect(r.status).toBe("needs_judgment");
    expect(r.reorderQty).toBeNull();
  });

  it("a week more than 40% from the average needs judgment", () => {
    const weeks = [...Array(15).fill(100), 150];
    expect(assess(sku({ weeks }), DEFAULT_RULES).status).toBe("needs_judgment");
    const mild = [...Array(15).fill(100), 130];
    expect(assess(sku({ weeks: mild }), DEFAULT_RULES).status).not.toBe("needs_judgment");
  });

  it("all-zero sales needs judgment instead of dividing by zero", () => {
    const r = assess(sku({ weeks: Array(16).fill(0) }), DEFAULT_RULES);
    expect(r.status).toBe("needs_judgment");
    expect(r.weeksOfCover).toBeNull();
  });

  it("a missing week is flagged and left out of the average", () => {
    const weeks: (number | null)[] = Array(16).fill(100);
    weeks[10] = null;
    const r = assess(sku({ weeks }), DEFAULT_RULES);
    expect(r.flags.map((f) => f.code)).toContain("missing_week");
    expect(r.avgWeeklySales).toBe(100);
  });

  it("zero stock is a stockout and is flagged", () => {
    const r = assess(sku({ stockOnHand: 0 }), DEFAULT_RULES);
    expect(r.status).toBe("stockout");
    expect(r.flags.map((f) => f.code)).toContain("zero_stock");
  });

  it("an inactive supplier is flagged", () => {
    const r = assess(sku({ supplierActive: false, stockOnHand: 0 }), DEFAULT_RULES);
    expect(r.flags.map((f) => f.code)).toContain("supplier_inactive");
  });

  it("perishable band is 3 to 4 weeks", () => {
    const p = (stock: number) => assess(sku({ perishability: "High", stockOnHand: stock }), DEFAULT_RULES).status;
    expect(p(250)).toBe("stockout"); // 2.5
    expect(p(350)).toBe("ok"); // 3.5
    expect(p(450)).toBe("overstock"); // 4.5
  });

  it("warns when cover after the order is still too low", () => {
    const r = assess(sku({ stockOnHand: 0, standardReorderQty: 100 }), DEFAULT_RULES);
    expect(r.weeksOfCoverAfter).toBe(1);
    expect(r.warning).toMatch(/under the 6-week minimum/);
  });

  it("warns when a perishable order overshoots the cap", () => {
    const r = assess(sku({ perishability: "High", stockOnHand: 200, standardReorderQty: 400 }), DEFAULT_RULES);
    expect(r.status).toBe("stockout");
    expect(r.weeksOfCoverAfter).toBe(6);
    expect(r.warning).toMatch(/above the 4-week limit/);
  });

  it("thresholds come from settings, not code", () => {
    const strict = { ...DEFAULT_RULES, minCoverWeeks: 12 };
    expect(assess(sku({ stockOnHand: 800 }), strict).status).toBe("stockout");
  });
});

describe("ISO weeks", () => {
  it("counts back from the week of the stock date", () => {
    const w = windowBefore("2026-10-19", 16);
    expect(w).toHaveLength(16);
    expect(w.at(-1)).toBe("2026-W42");
    expect(w[0]).toBe("2026-W27");
  });
  it("handles year boundaries", () => {
    expect(windowBefore("2026-01-05", 3)).toEqual(["2025-W51", "2025-W52", "2026-W01"]);
    expect(weekLabelOf(Date.UTC(2026, 11, 31))).toBe("2026-W53");
  });
});

describe("upload validation (plain-English errors)", () => {
  const withSales = (extra: string) => ({ ...sampleFiles, weekly_sales: sampleFiles.weekly_sales + extra });

  it("reports a missing column", () => {
    const r = validateUpload({ ...sampleFiles, weekly_sales: "SKU_ID,Week\nSKU001,2026-W27\n" });
    expect(r.errors[0].message).toMatch(/missing the column Units_Sold/);
  });
  it("reports negative stock", () => {
    const bad = sampleFiles.current_inventory.replace("SKU001,Pune Central Warehouse,900", "SKU001,Pune Central Warehouse,-5");
    expect(validateUpload({ ...sampleFiles, current_inventory: bad }).errors.map((e) => e.message).join()).toMatch(/negative/);
  });
  it("reports an unknown supplier", () => {
    const bad = sampleFiles.sku_master.replace("DIST004", "DIST999");
    expect(validateUpload({ ...sampleFiles, sku_master: bad }).errors.map((e) => e.message).join()).toMatch(/DIST999.*not in distributor_master/);
  });
  it("reports a duplicate week", () => {
    const r = validateUpload(withSales("SKU001,2026-W27,100\n"));
    expect(r.errors.map((e) => e.message).join()).toMatch(/SKU001 has 2026-W27 twice/);
  });
  it("reports negative sales", () => {
    const r = validateUpload(withSales("SKU001,2026-W50,-3\n"));
    expect(r.errors.map((e) => e.message).join()).toMatch(/negative/);
  });
  it("reports a master SKU with no stock row", () => {
    const bad = sampleFiles.current_inventory.replace(/SKU015,.*\n?/, "");
    expect(validateUpload({ ...sampleFiles, current_inventory: bad }).errors.map((e) => e.message).join()).toMatch(/SKU015.*no stock row/);
  });
  it("warns, but does not block, on a SKU in sales but not in master", () => {
    const r = validateUpload(withSales("SKU099,2026-W27,10\n"));
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.message).join()).toMatch(/SKU099.*not in sku_master/);
  });
  it("accepts a weekly refresh of just sales and stock", () => {
    const base = validateUpload(sampleFiles).dataset!;
    const r = validateUpload(
      { weekly_sales: sampleFiles.weekly_sales, current_inventory: sampleFiles.current_inventory },
      base,
    );
    expect(r.errors).toEqual([]);
  });
  it("refuses a first upload with no SKU list", () => {
    const r = validateUpload({ weekly_sales: sampleFiles.weekly_sales });
    expect(r.errors.map((e) => e.message).join()).toMatch(/upload sku_master/);
  });
});
