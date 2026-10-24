import type { RuleSettings } from "./types";

export type RuleField = {
  key: keyof RuleSettings;
  label: string;
  help: string;
  unit: string;
  /** The stored number is the shown number divided by this (percentages are stored as fractions). */
  scale: number;
  step: number;
  group: "Needs judgment" | "Cover bands" | "Demand" | "Zoho";
};

export const RULE_FIELDS: RuleField[] = [
  { key: "minHistoryWeeks", label: "Minimum weeks of history", help: "Fewer weeks than this and the SKU goes to Raghav with no number.", unit: "weeks", scale: 1, step: 1, group: "Needs judgment" },
  { key: "swingPct", label: "Weekly sales swing", help: "Any of the weeks averaged that is further than this from the average sends the SKU to Raghav.", unit: "%", scale: 0.01, step: 1, group: "Needs judgment" },
  { key: "avgWindowWeeks", label: "Weeks in the average", help: "Average weekly sales is the mean of this many recent weeks (out of 16).", unit: "weeks", scale: 1, step: 1, group: "Demand" },
  { key: "recentWindowWeeks", label: "Weeks in the recent average", help: "Used for the high-demand tag.", unit: "weeks", scale: 1, step: 1, group: "Demand" },
  { key: "highDemandPct", label: "High-demand threshold", help: "Recent average must be this far above the long average.", unit: "%", scale: 0.01, step: 1, group: "Demand" },
  { key: "highDemandQtyMultiplier", label: "High-demand order multiplier", help: "A reorder for a high-demand SKU is this many times the standard quantity.", unit: "×", scale: 1, step: 0.1, group: "Demand" },
  { key: "festivalUplift", label: "Festival month uplift", help: "Average sales are multiplied by this in festival months, for the cover checks only.", unit: "×", scale: 1, step: 0.05, group: "Demand" },
  { key: "minCoverWeeks", label: "Normal SKU: reorder below", help: "Weeks of cover under this is a stockout risk.", unit: "weeks", scale: 1, step: 0.5, group: "Cover bands" },
  { key: "maxCoverWeeks", label: "Normal SKU: pause above", help: "Weeks of cover over this is an overstock risk.", unit: "weeks", scale: 1, step: 0.5, group: "Cover bands" },
  { key: "perishableMinCoverWeeks", label: "Perishable SKU: reorder below", help: "For SKUs with Perishability = High.", unit: "weeks", scale: 1, step: 0.5, group: "Cover bands" },
  { key: "perishableMaxCoverWeeks", label: "Perishable SKU: pause above", help: "For SKUs with Perishability = High.", unit: "weeks", scale: 1, step: 0.5, group: "Cover bands" },
  { key: "overdueOrderDays", label: "Overdue Zoho order cut-off", help: "Open orders late by more than this many days are left out of cover.", unit: "days", scale: 1, step: 1, group: "Zoho" },
];

export const fieldLabel = (key: keyof RuleSettings) => RULE_FIELDS.find((f) => f.key === key)?.label ?? key;

/** Shown form of a stored value, e.g. 0.4 becomes 40 for a percentage. */
export function toDisplay(f: RuleField, stored: number): number {
  return Math.round((stored / f.scale) * 1000) / 1000;
}

export type RuleChange = { key: keyof RuleSettings; label: string; from: string; to: string };

const show = (f: RuleField, v: number) => `${toDisplay(f, v)}${f.unit === "%" ? "%" : f.unit === "×" ? "×" : ` ${f.unit}`}`;

export function diffSettings(prev: RuleSettings | null, next: RuleSettings): RuleChange[] {
  if (!prev) return [];
  return RULE_FIELDS.filter((f) => prev[f.key] !== next[f.key]).map((f) => ({
    key: f.key,
    label: f.label,
    from: show(f, prev[f.key]),
    to: show(f, next[f.key]),
  }));
}

export type ParsedRules = { ok: true; settings: RuleSettings } | { ok: false; errors: string[] };

/** Reads the Admin's form (numbers as typed) and checks every value makes sense. */
export function parseRuleForm(raw: Record<string, string>): ParsedRules {
  const errors: string[] = [];
  const s = {} as Record<string, number>;
  for (const f of RULE_FIELDS) {
    const text = (raw[f.key] ?? "").trim();
    const n = Number(text);
    if (text === "" || !Number.isFinite(n)) {
      errors.push(`${f.label}: please enter a number.`);
      continue;
    }
    s[f.key] = Math.round(n * f.scale * 1e6) / 1e6;
  }
  if (errors.length) return { ok: false, errors };
  const r = s as unknown as RuleSettings;

  const int = (k: keyof RuleSettings, lo: number, hi: number) => {
    if (!Number.isInteger(r[k]) || r[k] < lo || r[k] > hi) errors.push(`${fieldLabel(k)} must be a whole number from ${lo} to ${hi}.`);
  };
  const range = (k: keyof RuleSettings, lo: number, hi: number, unit = "") => {
    if (r[k] < lo || r[k] > hi) errors.push(`${fieldLabel(k)} must be between ${lo}${unit} and ${hi}${unit}.`);
  };
  int("minHistoryWeeks", 1, 16);
  int("avgWindowWeeks", 1, 16);
  int("recentWindowWeeks", 1, 16);
  int("overdueOrderDays", 0, 90);
  if (r.recentWindowWeeks > r.avgWindowWeeks) errors.push("Weeks in the recent average cannot be more than weeks in the average.");
  range("swingPct", 0.05, 2);
  range("highDemandPct", 0.01, 2);
  range("highDemandQtyMultiplier", 1, 5);
  range("festivalUplift", 1, 3);
  range("minCoverWeeks", 0.5, 52);
  range("maxCoverWeeks", 0.5, 52);
  range("perishableMinCoverWeeks", 0.5, 52);
  range("perishableMaxCoverWeeks", 0.5, 52);
  if (r.maxCoverWeeks <= r.minCoverWeeks) errors.push("Normal SKU: the pause level must be higher than the reorder level.");
  if (r.perishableMaxCoverWeeks <= r.perishableMinCoverWeeks) errors.push("Perishable SKU: the pause level must be higher than the reorder level.");
  return errors.length ? { ok: false, errors } : { ok: true, settings: r };
}
