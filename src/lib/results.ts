// Results tracker maths. Losses are typed in by Raghav (never guessed); this file only compares them to the baseline.

export const LAKH = 100_000;
/** Combined stockout + overstock loss per quarter before the planner: Rs 28 to 34 lakh. */
export const BASELINE_LOW = 28 * LAKH;
export const BASELINE_HIGH = 34 * LAKH;
export const BASELINE_MID = (BASELINE_LOW + BASELINE_HIGH) / 2;
/** Goal: cut that loss by 25 percent (Rs 7 to 8.5 lakh a quarter) by the second full quarter. */
export const TARGET_CUT = 0.25;
/** The app went live with the stock file of this date. */
export const LAUNCH_DATE = "2026-10-19";

export type Quarter = { year: number; q: number };

export function parseQuarter(label: string): Quarter | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(label.trim().toUpperCase());
  return m ? { year: Number(m[1]), q: Number(m[2]) } : null;
}

export const quarterLabel = (x: Quarter) => `${x.year}-Q${x.q}`;
const index = (x: Quarter) => x.year * 4 + (x.q - 1);
const fromIndex = (i: number): Quarter => ({ year: Math.floor(i / 4), q: (i % 4) + 1 });

export function quarterOfDate(isoDate: string): Quarter {
  const [y, m] = isoDate.split("-").map(Number);
  return { year: y, q: Math.floor((m - 1) / 3) + 1 };
}

/** The launch quarter is only part-way through, so the first FULL quarter is the next one. */
export function fullQuarterLabels(launchDate = LAUNCH_DATE, count = 4): string[] {
  const first = index(quarterOfDate(launchDate)) + 1;
  return Array.from({ length: count }, (_, i) => quarterLabel(fromIndex(first + i)));
}

export type QuarterRole = "before" | "launch" | "full1" | "full2" | "later";

export function roleOf(label: string, launchDate = LAUNCH_DATE): QuarterRole {
  const q = parseQuarter(label);
  if (!q) return "later";
  const launch = index(quarterOfDate(launchDate));
  const d = index(q) - launch;
  return d < 0 ? "before" : d === 0 ? "launch" : d === 1 ? "full1" : d === 2 ? "full2" : "later";
}

/** How far the combined loss has fallen against the middle of the baseline range (negative = got worse). */
export function reductionVsBaseline(combinedInr: number): number {
  return (BASELINE_MID - combinedInr) / BASELINE_MID;
}

export type Verdict = { tone: "good" | "warn" | "bad" | "neutral"; text: string };

export function verdict(label: string, combinedInr: number, launchDate = LAUNCH_DATE): Verdict {
  const cut = reductionVsBaseline(combinedInr);
  const pct = `${(cut * 100).toFixed(0)}%`;
  const role = roleOf(label, launchDate);
  if (role === "before") return { tone: "neutral", text: "Before the planner started." };
  if (role === "launch") return { tone: "neutral", text: `Part quarter (launch). Down ${pct}. Not counted towards the target.` };
  if (cut >= TARGET_CUT) return { tone: "good", text: `Down ${pct}. Target of ${TARGET_CUT * 100}% reached.` };
  if (cut >= 0.11) return { tone: "warn", text: `Down ${pct}. Above the 11% minimum, short of the ${TARGET_CUT * 100}% target.` };
  return { tone: role === "full2" || role === "later" ? "bad" : "warn", text: cut >= 0 ? `Down only ${pct}.` : `Up ${Math.abs(cut * 100).toFixed(0)}% on baseline.` };
}

export function formatLakh(inr: number): string {
  return `₹${Number((inr / LAKH).toFixed(2))} lakh`;
}
