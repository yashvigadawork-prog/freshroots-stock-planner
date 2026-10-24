import { desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { cycles, ruleVersions, uploadSnapshots } from "@/db/schema";
import { assessAll } from "@/lib/data/inputs";
import type { SkuRow } from "@/lib/data/csv";
import type { Assessment, SkuInput } from "@/lib/rules/types";
import { daysSinceDate } from "@/lib/time";
import { getCurrentRules } from "./rules";
import { cycleProgress, type Progress } from "./decisions";

export const STALE_WARN_DAYS = 4;
export const STALE_BLOCK_DAYS = 7;
export const REVIEW_OVERDUE_DAYS = 2;

export type Row = { sku: SkuRow; supplierName: string; input: SkuInput; a: Assessment };

/**
 * Everything the screens need. If a review is open, the numbers come from that review's own
 * upload, rule version and Zoho orders, so the Home table always matches the cards.
 */
export async function loadWorkspace(db: Db) {
  const [openCycle] = await db.select().from(cycles).where(eq(cycles.status, "open")).limit(1);
  const [lastCycle] = openCycle ? [openCycle] : await db.select().from(cycles).orderBy(desc(cycles.id)).limit(1);
  const cycle = lastCycle ?? null;

  let snapshot;
  let rules;
  if (cycle) {
    [snapshot] = await db.select().from(uploadSnapshots).where(eq(uploadSnapshots.id, cycle.snapshotId));
    [rules] = await db.select().from(ruleVersions).where(eq(ruleVersions.id, cycle.ruleVersionId));
  } else {
    [snapshot] = await db.select().from(uploadSnapshots).orderBy(desc(uploadSnapshots.id)).limit(1);
    rules = await getCurrentRules(db);
  }
  if (!snapshot) return null;

  const { results, inputs, weekLabels, asOfDate } = assessAll(snapshot.dataset, rules.settings, cycle?.openOrders ?? null);
  const supplier = new Map(snapshot.dataset.distributors.map((d) => [d.distributorId, d.name]));
  const rows: Row[] = snapshot.dataset.skus.map((sku, i) => ({
    sku,
    supplierName: supplier.get(sku.distributorId) ?? sku.distributorId,
    input: inputs[i],
    a: results[i],
  }));
  const progress: Progress | null = cycle ? await cycleProgress(db, cycle.id) : null;
  return {
    snapshot,
    rules,
    cycle,
    openCycle: openCycle ?? null,
    progress,
    rows,
    weekLabels,
    asOfDate,
    staleDays: daysSinceDate(asOfDate),
  };
}
