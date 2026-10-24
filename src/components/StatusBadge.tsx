import type { Assessment } from "@/lib/rules/types";

const MAP: Record<Assessment["status"], [string, string]> = {
  stockout: ["Stockout risk", "stockout"],
  overstock: ["Overstock risk", "overstock"],
  needs_judgment: ["Needs judgment", "judgment"],
  ok: ["OK", "ok"],
};

/** Status is always a coloured dot plus a word, never colour alone. */
export default function StatusBadge({ status, highDemand }: { status: Assessment["status"]; highDemand?: boolean }) {
  const [text, cls] = MAP[status];
  return (
    <span className="badges">
      <span className={`badge ${cls}`}>{text}</span>
      {highDemand && <span className="badge high">High demand</span>}
    </span>
  );
}
