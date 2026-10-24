import type { RuleSettings } from "./types";

/** Version 1 of the rules, exactly as written in the brief. Admin edits create new versions. */
export const DEFAULT_RULES: RuleSettings = {
  minHistoryWeeks: 12,
  avgWindowWeeks: 12,
  recentWindowWeeks: 4,
  swingPct: 0.4,
  festivalUplift: 1.25,
  highDemandPct: 0.2,
  highDemandQtyMultiplier: 1.5,
  minCoverWeeks: 6,
  maxCoverWeeks: 14,
  perishableMinCoverWeeks: 3,
  perishableMaxCoverWeeks: 4,
  overdueOrderDays: 14,
};
