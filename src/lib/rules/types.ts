// Plain-rule types. No machine learning anywhere: every number is arithmetic on these inputs.

export type RuleSettings = {
  /** Weeks of history needed before a number is recommended. */
  minHistoryWeeks: number;
  /** Weeks averaged for "average weekly sales". */
  avgWindowWeeks: number;
  /** Recent weeks compared to the average for the high-demand tag. */
  recentWindowWeeks: number;
  /** Any week further than this fraction from the average sends the SKU to Raghav. */
  swingPct: number;
  /** Multiplier on average sales in festival months (cover checks only). */
  festivalUplift: number;
  /** Recent average must beat the long average by this fraction for the high-demand tag. */
  highDemandPct: number;
  /** Order quantity multiplier when high demand and a reorder is needed. */
  highDemandQtyMultiplier: number;
  /** Normal band, in weeks of cover. */
  minCoverWeeks: number;
  maxCoverWeeks: number;
  /** Band for perishable SKUs (Perishability = High). */
  perishableMinCoverWeeks: number;
  perishableMaxCoverWeeks: number;
  /** Zoho open orders late by more than this many days are left out of cover. */
  overdueOrderDays: number;
};

export type Perishability = "High" | "Medium" | "Low";

export type SkuInput = {
  skuId: string;
  skuName: string;
  perishability: Perishability;
  standardReorderQty: number;
  /** Last 16 weekly slots, oldest first. null = the week is missing from the file. */
  weeks: (number | null)[];
  stockOnHand: number;
  /** Open Zoho purchase-order quantity. null = Zoho not connected (counted as 0). */
  openOrderQty: number | null;
  isFestivalMonth: boolean;
  /** false when the supplier is marked inactive: flag it, create no draft. */
  supplierActive?: boolean;
};

export type MainStatus = "needs_judgment" | "stockout" | "overstock" | "ok";

export type TraceLine = {
  label: string;
  /** Plain-language formula with the real numbers filled in. */
  formula: string;
  value: string;
};

export type Flag = {
  code:
    | "missing_week"
    | "zero_sales_weeks"
    | "zero_stock"
    | "supplier_inactive"
    | "zoho_not_connected";
  text: string;
};

export type Assessment = {
  skuId: string;
  status: MainStatus;
  highDemand: boolean;
  perishable: boolean;
  weeksOfHistory: number;
  avgWeeklySales: number | null; // mean of last 12 weeks, no uplift
  recentAvgSales: number | null; // mean of last 4 weeks
  effectiveWeeklySales: number | null; // average with festival uplift if it applies
  weeksOfCover: number | null;
  band: { min: number; max: number };
  /** Recommended order. null when no reorder is recommended. */
  reorderQty: number | null;
  weeksOfCoverAfter: number | null;
  /** Amber warning when cover after the order is still outside the band. */
  warning: string | null;
  /** One-sentence plain-language reason. */
  reason: string;
  flags: Flag[];
  trace: TraceLine[];
};
