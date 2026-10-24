"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import { closeCycle, decide, DecisionError, type DecideInput } from "@/lib/services/decisions";
import { createDrafts, DraftBlocked } from "@/lib/services/zoho";

type Result = { ok: true; note?: string } | { ok: false; error: string };

export async function decideAction(input: DecideInput): Promise<Result> {
  try {
    const db = await getDb();
    const { actor } = await getActor(db);
    await decide(db, input, actor);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof DecisionError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function closeCycleAction(cycleId: number): Promise<Result> {
  try {
    const db = await getDb();
    const { actor } = await getActor(db);
    await closeCycle(db, cycleId, actor);
    // Approvals are saved. Now try the draft orders; if Zoho is off, blocked or down, nothing is lost and it can be retried.
    let note: string;
    try {
      const run = await createDrafts(db, cycleId);
      note = run.created.length ? `Review closed. ${run.created.length} draft order${run.created.length === 1 ? "" : "s"} created in Zoho.` : "Review closed.";
      if (run.failed.length) note += " Some drafts failed; retry them on the Zoho orders page.";
    } catch (e) {
      if (!(e instanceof DraftBlocked)) throw e;
      note = `Review closed. ${e.message}`;
    }
    revalidatePath("/", "layout");
    return { ok: true, note };
  } catch (e) {
    if (e instanceof DecisionError) return { ok: false, error: e.message };
    throw e;
  }
}
