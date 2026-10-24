"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import { parseRuleForm } from "@/lib/rules/fields";
import { RulesError, saveNewVersion } from "@/lib/services/rules";

export type RulesState = { ok: boolean; errors: string[]; message?: string } | null;

export async function saveRulesAction(_prev: RulesState, form: FormData): Promise<RulesState> {
  const raw: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") raw[k] = v;
  const parsed = parseRuleForm(raw);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  try {
    const db = await getDb();
    const { actor } = await getActor(db);
    const row = await saveNewVersion(db, parsed.settings, raw.changeNote ?? "", actor);
    revalidatePath("/", "layout");
    return { ok: true, errors: [], message: `Saved as version ${row.version}. It applies to the next review you start. The review that is open keeps the version it began with.` };
  } catch (e) {
    if (e instanceof RulesError) return { ok: false, errors: [e.message] };
    throw e;
  }
}
