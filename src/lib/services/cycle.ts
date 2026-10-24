import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { cycles, recommendations, ruleVersions, uploadSnapshots } from "@/db/schema";
import { assessAll } from "@/lib/data/inputs";
import { evaluateKillTriggers } from "./kill";

/** Picks `n` items at random without repeats. `rng` is injectable so tests are repeatable. */
export function pickRandom<T>(items: T[], n: number, rng: () => number = Math.random): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

export class CycleError extends Error {}

/**
 * Starts a weekly review from a stored snapshot. Every flagged SKU (stockout, overstock,
 * needs judgment) gets a card, plus 2 random SKUs that were not flagged as spot-checks.
 */
export async function openCycle(
  db: Db,
  args: { snapshotId: number; ruleVersionId: number; userId: string | null; openOrders: Record<string, number> | null },
  rng: () => number = Math.random,
) {
  const [open] = await db.select().from(cycles).where(eq(cycles.status, "open")).limit(1);
  if (open) throw new CycleError("There is already an open review. Close it before starting a new one.");

  const [snap] = await db.select().from(uploadSnapshots).where(eq(uploadSnapshots.id, args.snapshotId));
  const [rules] = await db.select().from(ruleVersions).where(eq(ruleVersions.id, args.ruleVersionId));
  if (!snap || !rules) throw new CycleError("Could not find that upload or rule version.");

  const { results } = assessAll(snap.dataset, rules.settings, args.openOrders);
  const flagged = results.filter((r) => r.status !== "ok");
  const spots = pickRandom(results.filter((r) => r.status === "ok"), 2, rng);

  const created = await db.transaction(async (tx) => {
    const [cycle] = await tx
      .insert(cycles)
      .values({ snapshotId: snap.id, ruleVersionId: rules.id, openOrders: args.openOrders, openedBy: args.userId })
      .returning();
    const rows = [
      ...flagged.map((a) => ({ cycleId: cycle.id, skuId: a.skuId, assessment: a, spotCheck: false })),
      ...spots.map((a) => ({ cycleId: cycle.id, skuId: a.skuId, assessment: a, spotCheck: true })),
    ];
    if (rows.length) await tx.insert(recommendations).values(rows);
    return cycle;
  });
  await evaluateKillTriggers(db);
  return created;
}

export async function openCycleOrNull(db: Db) {
  const [row] = await db.select().from(cycles).where(and(eq(cycles.status, "open"))).limit(1);
  return row ?? null;
}
