import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { lossEntries } from "@/db/schema";
import { LAKH, parseQuarter, quarterLabel } from "@/lib/results";
import { evaluateKillTriggers } from "./kill";

export class ResultsError extends Error {}

export async function listLosses(db: Db) {
  const rows = await db.select().from(lossEntries).orderBy(asc(lossEntries.quarter));
  return rows.map((r) => ({
    id: r.id,
    quarter: r.quarter,
    stockoutInr: Number(r.stockoutLossInr),
    overstockInr: Number(r.overstockLossInr),
    note: r.note,
    enteredAt: r.enteredAt,
  }));
}

/** One row per quarter: entering the same quarter again corrects it. Amounts arrive in lakh and are stored in rupees. */
export async function saveLoss(
  db: Db,
  input: { quarter: string; stockoutLakh: number; overstockLakh: number; note?: string },
  actor: { id: string; role: string },
) {
  if (actor.role === "backup") throw new ResultsError("Losses are entered by Raghav or an Admin.");
  const q = parseQuarter(input.quarter);
  if (!q) throw new ResultsError("Quarter should look like 2027-Q1.");
  for (const [label, v] of [["Stockout loss", input.stockoutLakh], ["Overstock loss", input.overstockLakh]] as const) {
    if (!Number.isFinite(v) || v < 0) throw new ResultsError(`${label} must be zero or more.`);
    if (v > 1000) throw new ResultsError(`${label} looks too big. Enter it in lakh, for example 14.5.`);
  }
  const values = {
    quarter: quarterLabel(q),
    stockoutLossInr: String(Math.round(input.stockoutLakh * LAKH)),
    overstockLossInr: String(Math.round(input.overstockLakh * LAKH)),
    note: input.note?.trim() || null,
    enteredBy: actor.id,
    enteredAt: new Date(),
  };
  const [existing] = await db.select().from(lossEntries).where(eq(lossEntries.quarter, values.quarter));
  if (existing) await db.update(lossEntries).set(values).where(eq(lossEntries.id, existing.id));
  else await db.insert(lossEntries).values(values);
  await evaluateKillTriggers(db);
}
