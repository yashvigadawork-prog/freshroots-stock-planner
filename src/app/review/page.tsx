import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { recommendations, users } from "@/db/schema";
import { getActor } from "@/lib/actor";
import { loadWorkspace, REVIEW_OVERDUE_DAYS } from "@/lib/services/workspace";
import { daysSince, formatWhen } from "@/lib/time";
import Rooty from "@/components/Rooty";
import ReviewCard, { type CardData } from "./ReviewCard";
import CloseCycle from "./CloseCycle";

export const dynamic = "force-dynamic";

const ORDER = { stockout: 0, needs_judgment: 1, overstock: 2, ok: 3 } as const;

export default async function ReviewPage() {
  const db = await getDb();
  const { actor } = await getActor(db);
  const ws = await loadWorkspace(db);

  if (!ws || !ws.openCycle || !ws.progress) {
    return (
      <main className="page">
        <h1>Review list</h1>
        <section className="card empty rise">
          <Rooty size={120} />
          <h2>All clear</h2>
          <p className="muted">
            {ws?.cycle?.closedAt
              ? `Last review was closed on ${formatWhen(ws.cycle.closedAt)}. Nothing is waiting for you.`
              : "No review is open. Nothing is waiting for you."}
          </p>
          <Link className="btn" href="/upload">Upload this week&apos;s data</Link>
        </section>
      </main>
    );
  }

  const { openCycle, progress, rows } = ws;
  const [recs, people] = await Promise.all([
    db.select().from(recommendations).where(eq(recommendations.cycleId, openCycle.id)),
    db.select().from(users),
  ]);
  const byId = new Map(rows.map((r) => [r.sku.skuId, r]));
  const who = new Map(people.map((p) => [p.id, p.name]));

  const cards: CardData[] = recs.flatMap((rec) => {
    const row = byId.get(rec.skuId);
    if (!row) return [];
    const a = rec.assessment;
    return [{
      id: rec.id,
      skuId: rec.skuId,
      name: row.sku.name,
      category: row.sku.category,
      supplier: row.supplierName,
      status: a.status,
      highDemand: a.highDemand,
      spotCheck: rec.spotCheck,
      reason: a.reason,
      ruleQty: a.reorderQty,
      standardQty: row.sku.standardReorderQty,
      cover: a.weeksOfCover,
      eff: a.effectiveWeeklySales,
      band: a.band,
      warning: a.warning,
      flags: a.flags.map((f) => f.text),
      trace: a.trace,
      decision: rec.decision,
      finalQty: rec.finalQty,
      decisionReason: rec.reason,
      decidedBy: rec.decidedBy ? (who.get(rec.decidedBy) ?? null) : null,
      decidedAt: rec.decidedAt ? formatWhen(rec.decidedAt) : null,
    } satisfies CardData];
  });

  const flagged = cards.filter((c) => !c.spotCheck).sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.skuId.localeCompare(b.skuId));
  const spots = cards.filter((c) => c.spotCheck).sort((a, b) => a.skuId.localeCompare(b.skuId));
  const age = daysSince(openCycle.openedAt);
  const overdue = age >= REVIEW_OVERDUE_DAYS;

  return (
    <main className="page">
      <h1>Review list</h1>
      <p className="muted">
        {progress.answered} of {progress.total} answered · stock date {ws.snapshot.asOfDate} · rules version {ws.rules.version}
      </p>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.answered} aria-label="Review progress">
        <div style={{ width: `${(progress.answered / progress.total) * 100}%` }} />
      </div>

      {overdue && <div className="alert warn" role="status"><strong>This review has been open {age} days.</strong> Aim to finish within {REVIEW_OVERDUE_DAYS}.</div>}
      {actor.role === "backup" && <div className="alert neutral" role="status">You are acting as the <strong>backup approver</strong>. Everything you do is logged under your name.</div>}

      <h2 className="section">Needs your decision ({flagged.length})</h2>
      {flagged.map((c) => <ReviewCard key={c.id} card={c} />)}

      <h2 className="section">Spot-checks ({spots.length})</h2>
      <p className="muted">Two SKUs picked at random that the rules called fine. Does OK look right to you?</p>
      {spots.map((c) => <ReviewCard key={c.id} card={c} />)}

      <CloseCycle cycleId={openCycle.id} remaining={progress.remaining} spotRemaining={progress.spotTotal - progress.spotAnswered} />
    </main>
  );
}
