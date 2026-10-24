import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { cycles, decisions, recommendations } from "@/db/schema";
import { evaluateKillTriggers } from "./kill";

export class DecisionError extends Error {}

export type Actor = { id: string; name: string; role: "planner" | "backup" | "admin" };

export type DecideInput = {
  recommendationId: number;
  action: "approved" | "changed" | "rejected";
  /** Quantity for "changed". Ignored otherwise. */
  qty?: number | null;
  reason?: string | null;
};

/**
 * Records Raghav's answer on one card and appends it to the decision log.
 * Approve takes the rule's number. Change needs a new quantity and a reason. Reject needs a reason.
 */
export async function decide(db: Db, input: DecideInput, actor: Actor) {
  const [rec] = await db.select().from(recommendations).where(eq(recommendations.id, input.recommendationId));
  if (!rec) throw new DecisionError("That item no longer exists.");
  const [cycle] = await db.select().from(cycles).where(eq(cycles.id, rec.cycleId));
  if (!cycle || cycle.status !== "open") throw new DecisionError("This review is already closed.");

  const reason = (input.reason ?? "").trim();
  const ruleQty = rec.assessment.reorderQty;
  let finalQty: number | null = null;

  if (input.action === "approved") {
    if (rec.assessment.status === "needs_judgment") {
      throw new DecisionError("This SKU has no recommended number. Use Change to set a quantity, or Reject for no order.");
    }
    finalQty = ruleQty;
  } else if (input.action === "changed") {
    if (!reason) throw new DecisionError("Please say why you are changing this.");
    if (input.qty === null || input.qty === undefined || !Number.isInteger(input.qty) || input.qty < 0) {
      throw new DecisionError("Quantity must be a whole number, zero or more.");
    }
    finalQty = input.qty;
  } else {
    if (!reason) throw new DecisionError("Please say why you are rejecting this.");
  }

  const at = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(recommendations)
      .set({ decision: input.action, finalQty, reason: reason || null, decidedBy: actor.id, decidedAt: at })
      .where(eq(recommendations.id, rec.id));
    await tx.insert(decisions).values({
      cycleId: rec.cycleId,
      recommendationId: rec.id,
      skuId: rec.skuId,
      action: input.action,
      ruleQty,
      finalQty,
      reason: reason || null,
      byUser: actor.id,
      asBackup: actor.role === "backup",
      ruleVersionId: cycle.ruleVersionId,
      at,
    });
  });
  await evaluateKillTriggers(db);
}

export type Progress = {
  total: number;
  answered: number;
  spotTotal: number;
  spotAnswered: number;
  remaining: number;
};

export async function cycleProgress(db: Db, cycleId: number): Promise<Progress> {
  const recs = await db.select().from(recommendations).where(eq(recommendations.cycleId, cycleId));
  const answered = recs.filter((r) => r.decision !== "pending");
  const spots = recs.filter((r) => r.spotCheck);
  return {
    total: recs.length,
    answered: answered.length,
    spotTotal: spots.length,
    spotAnswered: spots.filter((r) => r.decision !== "pending").length,
    remaining: recs.length - answered.length,
  };
}

/** A cycle can only be closed once every item and both spot-checks have an answer. */
export async function closeCycle(db: Db, cycleId: number, actor: Actor) {
  const [cycle] = await db.select().from(cycles).where(eq(cycles.id, cycleId));
  if (!cycle || cycle.status !== "open") throw new DecisionError("This review is not open.");
  const p = await cycleProgress(db, cycleId);
  if (p.spotAnswered < p.spotTotal) {
    throw new DecisionError(`Both spot-checks must be answered first (${p.spotAnswered} of ${p.spotTotal} done).`);
  }
  if (p.remaining > 0) {
    throw new DecisionError(`${p.remaining} item${p.remaining > 1 ? "s" : ""} still need an answer.`);
  }
  await db
    .update(cycles)
    .set({ status: "closed", closedBy: actor.id, closedAt: new Date() })
    .where(and(eq(cycles.id, cycleId), eq(cycles.status, "open")));
}
