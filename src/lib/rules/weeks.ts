// ISO week helpers. Weeks look like "2026-W27". Week 1 is the week containing 4 January; weeks start on Monday.

const DAY = 86_400_000;

export function parseWeek(label: string): { year: number; week: number } | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(label.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53) return null;
  return { year, week };
}

/** Monday of the given ISO week, as a UTC timestamp. */
function mondayOf(year: number, week: number): number {
  const jan4 = Date.UTC(year, 0, 4);
  const dow = new Date(jan4).getUTCDay() || 7; // Mon=1..Sun=7
  return jan4 - (dow - 1) * DAY + (week - 1) * 7 * DAY;
}

export function weekLabelOf(ts: number): string {
  const d = new Date(ts);
  const dow = d.getUTCDay() || 7;
  const thursday = ts + (4 - dow) * DAY;
  const year = new Date(thursday).getUTCFullYear();
  const week = Math.floor((thursday - mondayOf(year, 1)) / (7 * DAY)) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function isoDateToTs(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const ts = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(ts);
  if (d.getUTCMonth() !== Number(m[2]) - 1) return null;
  return ts;
}

/**
 * The `count` complete weeks before the week that contains `asOfDate`, oldest first.
 * Stock taken on Monday 2026-10-19 (week 43) is judged on sales up to week 42.
 */
export function windowBefore(asOfDate: string, count: number): string[] {
  const ts = isoDateToTs(asOfDate);
  if (ts === null) throw new Error(`Bad date: ${asOfDate}`);
  const thisWeek = parseWeek(weekLabelOf(ts))!;
  const start = mondayOf(thisWeek.year, thisWeek.week);
  const labels: string[] = [];
  for (let i = count; i >= 1; i--) labels.push(weekLabelOf(start - i * 7 * DAY));
  return labels;
}
