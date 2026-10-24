import { asc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { cycles, killTriggers, lossEntries, recommendations, ruleVersions, uploadSnapshots } from "@/db/schema";
import { assessAll } from "@/lib/data/inputs";
import {
  ruleNoImprovement, ruleRejectedStockouts, ruleRepeatStockouts, type CycleSnapshot, type Fired,
} from "@/lib/killtriggers";
import { fullQuarterLabels, reductionVsBaseline } from "@/lib/results";

export class KillError extends Error {}

async function cycleHistory(db: Db): Promise<CycleSnapshot[]> {
  const all = await db.select().from(cycles).orderBy(asc(cycles.id));
  const out: CycleSnapshot[] = [];
  for (const c of all) {
    const [snap] = await db.select().from(uploadSnapshots).where(eq(uploadSnapshots.id, c.snapshotId));
    const [rules] = await db.select().from(ruleVersions).where(eq(ruleVersions.id, c.ruleVersionId));
    const { results, inputs } = assessAll(snap.dataset, rules.settings, c.openOrders);
    out.push({
      openedAt: c.openedAt,
      rows: results.map((r, i) => ({ skuId: r.skuId, status: r.status, stock: inputs[i].stockOnHand })),
    });
  }
  return out;
}

/** Checks all three triggers and records any that newly fire. Each trigger fires once; an Admin must acknowledge it. */
export async function evaluateKillTriggers(db: Db): Promise<Fired[]> {
  const fired: Fired[] = [];

  const stockoutRecs = (await db.select().from(recommendations).orderBy(asc(recommendations.id))).filter(
    (r) => r.assessment.status === "stockout" && !r.spotCheck,
  );
  const r1 = ruleRejectedStockouts(stockoutRecs.map((r) => ({ id: r.id, decision: r.decision })));
  if (r1) fired.push(r1);

  fired.push(...ruleRepeatStockouts(await cycleHistory(db)));

  const [q1, q2] = fullQuarterLabels();
  const losses = await db.select().from(lossEntries);
  const a = losses.find((l) => l.quarter === q1);
  const b = losses.find((l) => l.quarter === q2);
  const r3 = a && b ? ruleNoImprovement(reductionVsBaseline(Number(b.stockoutLossInr) + Number(b.overstockLossInr))) : null;
  if (r3) fired.push(r3);

  const added: Fired[] = [];
  for (const f of fired) {
    const row = await db.insert(killTriggers).values(f).onConflictDoNothing().returning({ id: killTriggers.id });
    if (row.length) added.push(f);
  }
  return added;
}

export async function activeTriggers(db: Db) {
  return db.select().from(killTriggers).where(isNull(killTriggers.acknowledgedAt)).orderBy(asc(killTriggers.id));
}

export async function isDraftingPaused(db: Db): Promise<boolean> {
  return (await activeTriggers(db)).length > 0;
}

export async function acknowledgeTrigger(db: Db, id: number, actor: { id: string; role: string }) {
  if (actor.role !== "admin") throw new KillError("Only an Admin can acknowledge a kill trigger.");
  await db
    .update(killTriggers)
    .set({ acknowledgedBy: actor.id, acknowledgedAt: new Date() })
    .where(eq(killTriggers.id, id));
}
