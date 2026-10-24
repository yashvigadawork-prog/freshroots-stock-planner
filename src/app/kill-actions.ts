"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import { acknowledgeTrigger } from "@/lib/services/kill";

export async function acknowledgeAction(id: number): Promise<void> {
  const db = await getDb();
  const { actor } = await getActor(db);
  await acknowledgeTrigger(db, id, actor); // refuses anyone who is not an Admin
  revalidatePath("/", "layout");
}
