import { desc } from "drizzle-orm";
import type { Db } from "@/db";
import { ruleVersions } from "@/db/schema";
import { DEFAULT_RULES } from "@/lib/rules/defaults";
import { diffSettings } from "@/lib/rules/fields";
import type { RuleSettings } from "@/lib/rules/types";

/** Latest rule version. Creates version 1 from the brief's defaults the first time. */
export async function getCurrentRules(db: Db) {
  const [latest] = await db.select().from(ruleVersions).orderBy(desc(ruleVersions.version)).limit(1);
  if (latest) return latest;
  const [created] = await db
    .insert(ruleVersions)
    .values({ version: 1, settings: DEFAULT_RULES, changeNote: "Starting rules from the project brief" })
    .returning();
  return created;
}

export class RulesError extends Error {}

/** Rules are never edited in place. A change adds a new version, and old decisions keep the version they used. */
export async function saveNewVersion(
  db: Db,
  settings: RuleSettings,
  changeNote: string,
  actor: { id: string; role: string },
) {
  if (actor.role !== "admin") throw new RulesError("Only an Admin can change the rules.");
  const note = changeNote.trim();
  if (!note) throw new RulesError("Please say why you are changing the rules.");
  const current = await getCurrentRules(db);
  if (!diffSettings(current.settings, settings).length) throw new RulesError("Nothing was changed.");
  const [row] = await db
    .insert(ruleVersions)
    .values({ version: current.version + 1, settings, changeNote: note, changedBy: actor.id })
    .returning();
  return row;
}

export async function listVersions(db: Db) {
  return db.select().from(ruleVersions).orderBy(desc(ruleVersions.version));
}
