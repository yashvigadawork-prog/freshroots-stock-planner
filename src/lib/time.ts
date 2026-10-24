const IST = "Asia/Kolkata";

export function greeting(now = new Date()): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: IST }).format(now)) % 24;
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Whole days between an ISO date (YYYY-MM-DD, India time) and now. */
export function daysSinceDate(isoDate: string, now = new Date()): number {
  return Math.floor((now.getTime() - Date.parse(`${isoDate}T00:00:00+05:30`)) / 86_400_000);
}

export function daysSince(d: Date, now = new Date()): number {
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}

export function formatWhen(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: IST }).format(d);
}
