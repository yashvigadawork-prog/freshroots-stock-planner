"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { createDrafts, DraftBlocked, syncOpenOrders } from "@/lib/services/zoho";

export type Msg = { ok: boolean; text: string } | null;

export async function retrySyncAction(): Promise<void> {
  await syncOpenOrders(await getDb());
  revalidatePath("/", "layout");
}

export async function refreshAction(): Promise<Msg> {
  const s = await syncOpenOrders(await getDb());
  revalidatePath("/", "layout");
  if (!s.configured) return { ok: false, text: "Zoho is not connected yet." };
  return s.ok ? { ok: true, text: `Read ${s.orders} open order${s.orders === 1 ? "" : "s"} from Zoho.` } : { ok: false, text: s.error ?? "Zoho did not answer." };
}

export async function createDraftsAction(cycleId: number): Promise<Msg> {
  try {
    const run = await createDrafts(await getDb(), cycleId);
    revalidatePath("/", "layout");
    const parts: string[] = [];
    if (run.created.length) parts.push(`${run.created.length} draft order${run.created.length === 1 ? "" : "s"} created in Zoho (${run.created.map((c) => c.poNumber).join(", ")}).`);
    if (run.failed.length) parts.push(`${run.failed.length} failed (${run.failed[0].error}). Your approvals are safe; try again in a moment.`);
    if (run.skipped.length) parts.push(`${run.skipped.length} item${run.skipped.length === 1 ? " was" : "s were"} flagged and not drafted.`);
    if (!parts.length) parts.push("Nothing new to create.");
    return { ok: run.failed.length === 0, text: parts.join(" ") };
  } catch (e) {
    if (e instanceof DraftBlocked) return { ok: false, text: e.message };
    throw e;
  }
}
