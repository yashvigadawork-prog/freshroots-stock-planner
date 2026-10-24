import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "@/db";
import { recommendations } from "@/db/schema";
import { validateUpload, type FileKey } from "@/lib/data/csv";
import { getCurrentRules } from "@/lib/services/rules";
import { saveSnapshot, latestSnapshot } from "@/lib/services/snapshots";
import { openCycle, CycleError } from "@/lib/services/cycle";

const keys: FileKey[] = ["sku_master", "distributor_master", "weekly_sales", "current_inventory", "calendar"];
const files = Object.fromEntries(
  keys.map((k) => [k, readFileSync(path.join(__dirname, "../../../data/sample", `${k}.csv`), "utf8")]),
);

describe("snapshots and cycles (in-memory Postgres)", () => {
  let db: Db;
  beforeAll(async () => {
    db = await createDb({ memory: true });
  }, 60_000);

  it("stores rules v1, a snapshot, and a cycle with 7 flagged cards + 2 spot-checks", async () => {
    const rules = await getCurrentRules(db);
    expect(rules.version).toBe(1);
    expect((await getCurrentRules(db)).id).toBe(rules.id); // not duplicated

    const v = validateUpload(files);
    const snap = await saveSnapshot(db, v.dataset!, v.warnings, keys, null);
    expect((await latestSnapshot(db))!.id).toBe(snap.id);
    expect(snap.asOfDate).toBe("2026-10-19");

    const cycle = await openCycle(db, { snapshotId: snap.id, ruleVersionId: rules.id, userId: null, openOrders: null });
    const recs = await db.select().from(recommendations).where(eq(recommendations.cycleId, cycle.id));
    const flagged = recs.filter((r) => !r.spotCheck).map((r) => r.skuId).sort();
    expect(flagged).toEqual(["SKU001", "SKU003", "SKU004", "SKU006", "SKU007", "SKU011", "SKU013"]);
    const spots = recs.filter((r) => r.spotCheck);
    expect(spots).toHaveLength(2);
    expect(spots.every((r) => r.assessment.status === "ok")).toBe(true);
  });

  it("refuses a second open cycle", async () => {
    const snap = (await latestSnapshot(db))!;
    const rules = await getCurrentRules(db);
    await expect(
      openCycle(db, { snapshotId: snap.id, ruleVersionId: rules.id, userId: null, openOrders: null }),
    ).rejects.toBeInstanceOf(CycleError);
  });
});
