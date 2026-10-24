import type { Assessment, Flag, RuleSettings, SkuInput, TraceLine } from "./types";

const f1 = (n: number) => (Math.round(n * 10) / 10).toString();
const f2 = (n: number) => (Math.round(n * 100) / 100).toString();
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Applies the weekly rules to one SKU. Pure arithmetic: same inputs, same answer.
 * Order of checks (first match wins): needs judgment, stockout, overstock, ok.
 * High demand is an extra tag, not a main status.
 */
export function assess(input: SkuInput, s: RuleSettings): Assessment {
  const perishable = input.perishability === "High";
  const band = perishable
    ? { min: s.perishableMinCoverWeeks, max: s.perishableMaxCoverWeeks }
    : { min: s.minCoverWeeks, max: s.maxCoverWeeks };

  const slots = input.weeks;
  const present = slots.filter((w): w is number => w !== null);
  const weeksOfHistory = present.length;

  const avgWindow = slots.slice(-s.avgWindowWeeks);
  const avgVals = avgWindow.filter((w): w is number => w !== null);
  const recentVals = slots.slice(-s.recentWindowWeeks).filter((w): w is number => w !== null);

  const avg = avgVals.length > 0 ? mean(avgVals) : null;
  const recent = recentVals.length > 0 ? mean(recentVals) : null;

  const flags: Flag[] = [];
  const firstIdx = slots.findIndex((w) => w !== null);
  if (firstIdx >= 0 && slots.slice(firstIdx).some((w) => w === null)) {
    flags.push({ code: "missing_week", text: "A week is missing from the sales file. It was left out of the average." });
  }
  if (avgVals.some((w) => w === 0)) {
    flags.push({ code: "zero_sales_weeks", text: "At least one week had zero sales. It is counted as a real week." });
  }
  if (input.stockOnHand === 0) {
    flags.push({ code: "zero_stock", text: "Stock on hand is zero." });
  }
  if (input.supplierActive === false) {
    flags.push({ code: "supplier_inactive", text: "The supplier is marked inactive. Approving is saved, but no draft order is created." });
  }
  if (input.openOrderQty === null) {
    flags.push({ code: "zoho_not_connected", text: "Zoho is not connected, so open orders are counted as 0." });
  }

  const uplift = input.isFestivalMonth ? s.festivalUplift : 1;
  const effective = avg !== null ? avg * uplift : null;
  const openQty = input.openOrderQty ?? 0;
  const supply = input.stockOnHand + openQty;
  const cover = effective !== null && effective > 0 ? supply / effective : null;

  const highDemand = avg !== null && avg > 0 && recent !== null && recent > avg * (1 + s.highDemandPct);

  const trace: TraceLine[] = [];
  if (avg !== null) {
    trace.push({
      label: "Average weekly sales",
      formula: `mean of the last ${avgVals.length} weeks = ${f1(avg)}`,
      value: `${f1(avg)} units/week`,
    });
  }
  if (recent !== null && avg !== null) {
    trace.push({
      label: "High-demand check",
      formula: `last ${recentVals.length} weeks average ${f1(recent)} vs ${f1(avg)} × ${f2(1 + s.highDemandPct)} = ${f1(avg * (1 + s.highDemandPct))} (festival uplift is not applied here)`,
      value: highDemand ? "High demand" : "Normal",
    });
  }
  if (effective !== null) {
    trace.push({
      label: "Sales used for cover",
      formula: input.isFestivalMonth
        ? `${f1(avg!)} × ${f2(uplift)} festival uplift = ${f1(effective)}`
        : `${f1(avg!)} (no festival uplift this month)`,
      value: `${f1(effective)} units/week`,
    });
  }
  if (cover !== null) {
    trace.push({
      label: "Weeks of cover",
      formula: `(stock ${input.stockOnHand} + open orders ${openQty}) ÷ ${f1(effective!)} = ${f2(cover)}`,
      value: `${f1(cover)} weeks`,
    });
  }
  trace.push({
    label: "Target band",
    formula: `${perishable ? "Perishable" : "Normal"} SKU: ${band.min} to ${band.max} weeks`,
    value: `${band.min}–${band.max} weeks`,
  });

  const base = {
    skuId: input.skuId,
    highDemand,
    perishable,
    weeksOfHistory,
    avgWeeklySales: avg,
    recentAvgSales: recent,
    effectiveWeeklySales: effective,
    weeksOfCover: cover,
    band,
    flags,
    trace,
  };

  // 1. Needs judgment
  let judgment: string | null = null;
  if (weeksOfHistory < s.minHistoryWeeks) {
    judgment = `Only ${weeksOfHistory} weeks of sales history (need ${s.minHistoryWeeks}), so a number would be a guess. Please decide.`;
  } else if (avg === null || avg === 0) {
    judgment = `No sales in the last ${s.avgWindowWeeks} weeks, so cover cannot be worked out. Please decide.`;
  } else {
    const worst = avgVals.reduce((w, v) => (Math.abs(v - avg) > Math.abs(w - avg) ? v : w), avgVals[0]);
    const swing = Math.abs(worst - avg) / avg;
    if (swing > s.swingPct) {
      judgment = `Sales swing too much: one week sold ${worst} against an average of ${f1(avg)} (${Math.round(swing * 100)}% away, limit ${Math.round(s.swingPct * 100)}%). Please decide.`;
    }
  }
  if (judgment) {
    trace.push({ label: "Rule fired", formula: "Needs judgment is checked first", value: "Needs judgment" });
    return {
      ...base,
      status: "needs_judgment",
      reorderQty: null,
      weeksOfCoverAfter: null,
      warning: null,
      reason: judgment,
    };
  }

  // From here avg > 0, effective > 0 and cover is a number.
  const c = cover as number;
  const eff = effective as number;

  // 2. Stockout risk
  if (c < band.min) {
    const qty = Math.round(input.standardReorderQty * (highDemand ? s.highDemandQtyMultiplier : 1));
    const after = (supply + qty) / eff;
    let warning: string | null = null;
    if (after < band.min) {
      warning = `Even after this order cover is ${f2(after)} weeks, still under the ${band.min}-week minimum.`;
    } else if (after > band.max) {
      warning = `After this order cover is ${f2(after)} weeks, above the ${band.max}-week limit.`;
    }
    trace.push({
      label: "Rule fired",
      formula: `cover ${f2(c)} is below the minimum ${band.min}`,
      value: "Stockout risk",
    });
    trace.push({
      label: "Order quantity",
      formula: highDemand
        ? `standard ${input.standardReorderQty} × ${s.highDemandQtyMultiplier} (high demand) = ${qty}`
        : `standard reorder quantity = ${qty}`,
      value: `${qty} units`,
    });
    trace.push({
      label: "Cover after order",
      formula: `(${supply} + ${qty}) ÷ ${f1(eff)} = ${f2(after)}`,
      value: `${f2(after)} weeks`,
    });
    return {
      ...base,
      status: "stockout",
      reorderQty: qty,
      weeksOfCoverAfter: after,
      warning,
      reason: `Only ${f1(c)} weeks of stock left at ${f1(eff)} units a week, below the ${band.min}-week minimum, so reorder ${qty} now${highDemand ? " (1.5× the usual because demand is high)" : ""}.`,
    };
  }

  // 3. Overstock risk
  if (c > band.max) {
    trace.push({
      label: "Rule fired",
      formula: `cover ${f2(c)} is above the maximum ${band.max}`,
      value: "Overstock risk",
    });
    return {
      ...base,
      status: "overstock",
      reorderQty: null,
      weeksOfCoverAfter: null,
      warning: null,
      reason: `${f1(c)} weeks of stock is above the ${band.max}-week limit, so pause the next order.`,
    };
  }

  // 4/5. OK (high demand shows as a tag only)
  trace.push({
    label: "Rule fired",
    formula: `cover ${f2(c)} is inside ${band.min} to ${band.max}`,
    value: "OK",
  });
  return {
    ...base,
    status: "ok",
    reorderQty: null,
    weeksOfCoverAfter: null,
    warning: null,
    reason: `${f1(c)} weeks of stock is inside the ${band.min}–${band.max} week band, so no action.`,
  };
}
