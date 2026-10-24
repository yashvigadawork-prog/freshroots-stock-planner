import type { Assessment } from "@/lib/rules/types";

const SCALE = 24; // weeks shown on the bar

/** Weeks of cover as a bar, with the target band shaded behind it. */
export default function CoverBar({ a }: { a: Assessment }) {
  if (a.weeksOfCover === null) return <span className="muted">n/a</span>;
  const pct = (w: number) => `${Math.min(100, (w / SCALE) * 100)}%`;
  return (
    <div className="coverbar" role="img" aria-label={`${a.weeksOfCover.toFixed(1)} weeks of cover; target ${a.band.min} to ${a.band.max} weeks`}>
      <div className="band" style={{ left: pct(a.band.min), width: `calc(${pct(a.band.max)} - ${pct(a.band.min)})` }} />
      <div className={`fill ${a.status}`} style={{ width: pct(a.weeksOfCover) }} />
    </div>
  );
}
