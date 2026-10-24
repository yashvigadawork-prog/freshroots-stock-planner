import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { decisions, ruleVersions, users } from "@/db/schema";

export type LogRow = {
  id: number;
  at: Date;
  cycleId: number;
  skuId: string;
  action: "pending" | "approved" | "changed" | "rejected";
  ruleQty: number | null;
  finalQty: number | null;
  reason: string | null;
  who: string;
  asBackup: boolean;
  ruleVersion: number;
};

export async function listDecisions(db: Db, filter: { skuId?: string; action?: string } = {}): Promise<LogRow[]> {
  const conds = [];
  if (filter.skuId) conds.push(eq(decisions.skuId, filter.skuId));
  if (filter.action && ["approved", "changed", "rejected"].includes(filter.action)) {
    conds.push(eq(decisions.action, filter.action as "approved" | "changed" | "rejected"));
  }
  const rows = await db
    .select({
      id: decisions.id,
      at: decisions.at,
      cycleId: decisions.cycleId,
      skuId: decisions.skuId,
      action: decisions.action,
      ruleQty: decisions.ruleQty,
      finalQty: decisions.finalQty,
      reason: decisions.reason,
      who: users.name,
      asBackup: decisions.asBackup,
      ruleVersion: ruleVersions.version,
    })
    .from(decisions)
    .leftJoin(users, eq(decisions.byUser, users.id))
    .innerJoin(ruleVersions, eq(decisions.ruleVersionId, ruleVersions.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(decisions.at), desc(decisions.id));
  return rows.map((r) => ({ ...r, who: r.who ?? "Unknown" }));
}
