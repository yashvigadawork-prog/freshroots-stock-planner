// The three "stop and look" rules from the brief. Pure functions: the service feeds them real data.

export const FIRST_STOCKOUTS_WATCHED = 10;
export const REJECTIONS_TO_FIRE = 3;
export const REPEAT_STOCKOUTS_TO_FIRE = 2;
export const WATCH_WINDOW_DAYS = 56; // first 8 weeks
/** Combined losses must fall by at least this much after two full quarters (the low end of "11 to 13 percent"). */
export const MIN_REDUCTION = 0.11;

export type Fired = { code: string; detail: string };

/** 1. Raghav rejects 3 or more of the first 10 stockout recommendations as wrong. */
export function ruleRejectedStockouts(stockoutRecs: { id: number; decision: string }[]): Fired | null {
  const first = [...stockoutRecs].sort((a, b) => a.id - b.id).slice(0, FIRST_STOCKOUTS_WATCHED);
  const rejected = first.filter((r) => r.decision === "rejected").length;
  if (rejected < REJECTIONS_TO_FIRE) return null;
  return {
    code: "rejected_stockouts",
    detail: `Raghav rejected ${rejected} of the first ${first.length} stockout recommendations as wrong. The rules may be off, so draft orders are paused until an Admin has looked.`,
  };
}

export type CycleSnapshot = { openedAt: Date; rows: { skuId: string; status: string; stock: number }[] };

/**
 * 2. A SKU the rules called fine runs out of stock twice in the first 8 weeks.
 * "Runs out" means stock is 0 in the next review's stock file after the rules said OK.
 */
export function ruleRepeatStockouts(cycles: CycleSnapshot[]): Fired[] {
  const ordered = [...cycles].sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());
  if (ordered.length < 2) return [];
  const limit = ordered[0].openedAt.getTime() + WATCH_WINDOW_DAYS * 86_400_000;
  const hits = new Map<string, number>();
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].openedAt.getTime() > limit) break;
    const stockOf = new Map(ordered[i].rows.map((r) => [r.skuId, r.stock]));
    for (const prev of ordered[i - 1].rows) {
      if (prev.status === "ok" && stockOf.get(prev.skuId) === 0) hits.set(prev.skuId, (hits.get(prev.skuId) ?? 0) + 1);
    }
  }
  return [...hits.entries()]
    .filter(([, n]) => n >= REPEAT_STOCKOUTS_TO_FIRE)
    .map(([sku, n]) => ({
      code: `repeat_stockout:${sku}`,
      detail: `${sku} was marked fine but ran out of stock ${n} times in the first 8 weeks.`,
    }));
}

/** 3. After two full quarters, combined losses have not fallen by at least 11 percent. */
export function ruleNoImprovement(reductionAfterTwoQuarters: number | null): Fired | null {
  if (reductionAfterTwoQuarters === null || reductionAfterTwoQuarters >= MIN_REDUCTION) return null;
  return {
    code: "no_improvement",
    detail: `After two full quarters, combined losses are down only ${(reductionAfterTwoQuarters * 100).toFixed(0)}% (the minimum is ${MIN_REDUCTION * 100}%).`,
  };
}
