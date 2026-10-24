"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { FILE_COLUMNS, validateUpload, type FileKey, type Problem } from "@/lib/data/csv";
import { getCurrentRules } from "@/lib/services/rules";
import { latestSnapshot, saveSnapshot } from "@/lib/services/snapshots";
import { CycleError, openCycle } from "@/lib/services/cycle";
import { openOrdersForNewCycle } from "@/lib/services/zoho";

export type UploadState = {
  ok: boolean;
  errors: Problem[];
  warnings: Problem[];
  message?: string;
} | null;

const KEYS = Object.keys(FILE_COLUMNS) as FileKey[];

export async function uploadAction(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const files: Partial<Record<FileKey, string>> = {};
  for (const k of KEYS) {
    const f = formData.get(k);
    if (f instanceof File && f.size > 0) files[k] = await f.text();
  }
  const uploaded = Object.keys(files) as FileKey[];
  if (!uploaded.length) {
    return { ok: false, warnings: [], errors: [{ file: "weekly_sales", message: "No files were chosen. Pick at least weekly_sales.csv and current_inventory.csv." }] };
  }

  const db = await getDb();
  const previous = await latestSnapshot(db);
  const result = validateUpload(files, previous?.dataset);
  if (!result.dataset) {
    return { ok: false, errors: result.errors, warnings: result.warnings };
  }
  const snap = await saveSnapshot(db, result.dataset, result.warnings, uploaded, null);
  revalidatePath("/");
  revalidatePath("/upload");
  return {
    ok: true,
    errors: [],
    warnings: result.warnings,
    message: `Saved. Stock date ${snap.asOfDate}, ${result.dataset.skus.length} SKUs, ${uploaded.length} file${uploaded.length > 1 ? "s" : ""} uploaded.`,
  };
}

export async function startReviewAction(): Promise<void> {
  const db = await getDb();
  const snap = await latestSnapshot(db);
  if (!snap) return;
  const rules = await getCurrentRules(db);
  try {
    // Open Zoho orders count as incoming stock. Null (not connected, or Zoho down) never blocks the review.
    const openOrders = await openOrdersForNewCycle(db, rules.settings.overdueOrderDays);
    await openCycle(db, { snapshotId: snap.id, ruleVersionId: rules.id, userId: null, openOrders });
  } catch (e) {
    if (!(e instanceof CycleError)) throw e;
  }
  revalidatePath("/");
  redirect("/");
}
