"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import { MappingError, saveMappings } from "@/lib/services/zoho";

export type MapState = { ok: boolean; text: string } | null;

export async function saveMappingsAction(_p: MapState, form: FormData): Promise<MapState> {
  const items: Record<string, string> = {};
  const vendors: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v !== "string") continue;
    if (k.startsWith("item:")) items[k.slice(5)] = v;
    if (k.startsWith("vendor:")) vendors[k.slice(7)] = v;
  }
  try {
    const db = await getDb();
    const { actor } = await getActor(db);
    if (actor.role === "backup") return { ok: false, text: "Mapping is changed by Raghav or an Admin." };
    await saveMappings(db, { items, vendors });
    revalidatePath("/", "layout");
    return { ok: true, text: "Mapping saved." };
  } catch (e) {
    if (e instanceof MappingError) return { ok: false, text: e.message };
    throw e;
  }
}
