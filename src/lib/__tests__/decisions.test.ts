import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "@/db";
import { cycles, decisions, recommendations } from "@/db/schema";
import { seedIfEmpty } from "@/lib/services/seed";
import { ensureUsers } from "@/lib/services/users";
import { closeCycle, cycleProgress, decide, DecisionError, type Actor } from "@/lib/services/decisions";

describe("decisions and closing a cycle", () => {
  let db: Db;
  let raghav: Actor;
  let backup: Actor;
  let recs: (typeof recommendations.$inferSelect)[];
  let cycleId: number;

  beforeAll(async () => {
    db = await createDb({ memory: true });
    await seedIfEmpty(db);
    const us = await ensureUsers(db);
    raghav = us.find((u) => u.role === "planner")!;
    backup = us.find((u) => u.role === "backup")!;
    const [c] = await db.select().from(cycles);
    cycleId = c.id;
    recs = await db.select().from(recommendations).where(eq(recommendations.cycleId, cycleId));
  }, 60_000);

  const rec = (sku: string) => recs.find((r) => r.skuId === sku)!;

  it("starts with 9 items to answer (7 flagged + 2 spot-checks)", async () => {
    const p = await cycleProgress(db, cycleId);
    expect(p).toMatchObject({ total: 9, answered: 0, spotTotal: 2, spotAnswered: 0, remaining: 9 });
  });

  it("cannot close while items are unanswered", async () => {
    await expect(closeCycle(db, cycleId, raghav)).rejects.toThrow(/Both spot-checks must be answered|still need an answer/);
  });

  it("approve takes the rule quantity and writes a log row with the rule version", async () => {
    await decide(db, { recommendationId: rec("SKU001").id, action: "approved" }, raghav);
    const [r] = await db.select().from(recommendations).where(eq(recommendations.id, rec("SKU001").id));
    expect(r.decision).toBe("approved");
    expect(r.finalQty).toBe(750);
    const log = await db.select().from(decisions).where(eq(decisions.recommendationId, r.id));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ byUser: raghav.id, asBackup: false, ruleQty: 750, finalQty: 750 });
    expect(log[0].ruleVersionId).toBeGreaterThan(0);
  });

  it("change and reject both need a reason", async () => {
    await expect(decide(db, { recommendationId: rec("SKU003").id, action: "changed", qty: 400 }, raghav)).rejects.toBeInstanceOf(DecisionError);
    await expect(decide(db, { recommendationId: rec("SKU003").id, action: "rejected", reason: "  " }, raghav)).rejects.toBeInstanceOf(DecisionError);
  });

  it("change stores the new quantity; the backup approver is logged as backup", async () => {
    await decide(db, { recommendationId: rec("SKU003").id, action: "changed", qty: 400, reason: "Festival rush at the distributor" }, backup);
    const log = await db.select().from(decisions).where(eq(decisions.recommendationId, rec("SKU003").id));
    expect(log[0]).toMatchObject({ action: "changed", ruleQty: 300, finalQty: 400, asBackup: true });
  });

  it("closes only after every item, including both spot-checks, is answered", async () => {
    for (const r of recs) {
      if (r.id === rec("SKU001").id || r.id === rec("SKU003").id) continue;
      await decide(db, { recommendationId: r.id, action: "approved" }, raghav);
    }
    await closeCycle(db, cycleId, raghav);
    const [c] = await db.select().from(cycles).where(eq(cycles.id, cycleId));
    expect(c.status).toBe("closed");
    await expect(decide(db, { recommendationId: rec("SKU001").id, action: "approved" }, raghav)).rejects.toThrow(/closed/);
  });
});
