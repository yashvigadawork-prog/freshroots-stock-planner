"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import { ResultsError, saveLoss } from "@/lib/services/results";

export type ResultsState = { ok: boolean; message: string } | null;

export async function saveLossAction(_prev: ResultsState, form: FormData): Promise<ResultsState> {
  try {
    const db = await getDb();
    const { actor } = await getActor(db);
    await saveLoss(db, {
      quarter: String(form.get("quarter") ?? ""),
      stockoutLakh: Number(form.get("stockout")),
      overstockLakh: Number(form.get("overstock")),
      note: String(form.get("note") ?? ""),
    }, actor);
    revalidatePath("/results");
    return { ok: true, message: "Saved." };
  } catch (e) {
    if (e instanceof ResultsError) return { ok: false, message: e.message };
    throw e;
  }
}
