import { readFileSync } from "node:fs";
import path from "node:path";
import type { Db } from "@/db";
import { uploadSnapshots } from "@/db/schema";
import { validateUpload, type FileKey } from "@/lib/data/csv";
import { getCurrentRules } from "./rules";
import { saveSnapshot } from "./snapshots";
import { openCycle } from "./cycle";
import { ensureUsers } from "./users";

const KEYS: FileKey[] = ["sku_master", "distributor_master", "weekly_sales", "current_inventory", "calendar"];

/** First run only: people, rules v1, the sample snapshot (stock date 19 Oct 2026) and an open review. */
export async function seedIfEmpty(db: Db): Promise<boolean> {
  await ensureUsers(db);
  const rules = await getCurrentRules(db);
  const existing = await db.select({ id: uploadSnapshots.id }).from(uploadSnapshots).limit(1);
  if (existing.length) return false;
  const files = Object.fromEntries(
    KEYS.map((k) => [k, readFileSync(path.join(process.cwd(), "data", "sample", `${k}.csv`), "utf8")]),
  );
  const v = validateUpload(files);
  if (!v.dataset) throw new Error("Sample data failed validation: " + v.errors.map((e) => e.message).join("; "));
  const snap = await saveSnapshot(db, v.dataset, v.warnings, KEYS, null);
  await openCycle(db, { snapshotId: snap.id, ruleVersionId: rules.id, userId: null, openOrders: null });
  return true;
}
