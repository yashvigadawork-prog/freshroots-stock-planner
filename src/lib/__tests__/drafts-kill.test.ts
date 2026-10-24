import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "@/db";
import { cycles, killTriggers, recommendations, zohoDrafts, zohoItemMap, zohoVendorMap } from "@/db/schema";
import { seedIfEmpty } from "@/lib/services/seed";
import { ensureUsers } from "@/lib/services/users";
import { closeCycle, decide, type Actor } from "@/lib/services/decisions";
import { createDrafts, DraftBlocked, draftOverview, draftReminders, loadMappings, saveMappings, MappingError, openOrdersForNewCycle, syncOpenOrders, getSyncState, testConnection } from "@/lib/services/zoho";
import { acknowledgeTrigger, activeTriggers, evaluateKillTriggers, isDraftingPaused, KillError } from "@/lib/services/kill";
import { ZohoClient, forgetToken } from "@/lib/zoho/client";
import { ruleNoImprovement, ruleRejectedStockouts, ruleRepeatStockouts } from "@/lib/killtriggers";
import { saveLoss } from "@/lib/services/results";
import { LAKH } from "@/lib/results";
import { CFG, makeFakeZoho } from "./fakeZoho";

const NOW = new Date("2026-10-21T05:00:00Z"); // 2 days after the 19 Oct stock file

type Ctx = { db: Db; raghav: Actor; admin: Actor; cycleId: number; fake: ReturnType<typeof makeFakeZoho>; client: ZohoClient };

async function setup(opts: { approve?: boolean; map?: boolean } = {}): Promise<Ctx> {
  forgetToken();
  const db = await createDb({ memory: true });
  await seedIfEmpty(db);
  const us = await ensureUsers(db);
  const raghav = us.find((u) => u.role === "planner")! as Actor;
  const admin = us.find((u) => u.role === "admin")! as Actor;
  const [c] = await db.select().from(cycles);
  if (opts.approve !== false) {
    const recs = await db.select().from(recommendations).where(eq(recommendations.cycleId, c.id));
    for (const r of recs) {
      if (r.skuId === "SKU003") await decide(db, { recommendationId: r.id, action: "changed", qty: 310, reason: "Bulk slot" }, raghav);
      else await decide(db, { recommendationId: r.id, action: "approved" }, raghav);
    }
    await closeCycle(db, c.id, raghav);
  }
  if (opts.map !== false) {
    await db.insert(zohoVendorMap).values([
      { distributorId: "DIST001", zohoVendorId: "7001" }, { distributorId: "DIST002", zohoVendorId: "7002" },
    ]); // DIST004 deliberately not mapped
    await db.insert(zohoItemMap).values([
      { skuId: "SKU001", zohoItemId: "810001" }, { skuId: "SKU003", zohoItemId: "810003" },
      { skuId: "SKU004", zohoItemId: "810004" }, { skuId: "SKU011", zohoItemId: "810011" },
    ]); // SKU013 deliberately not mapped
  }
  const fake = makeFakeZoho();
  const client = new ZohoClient(CFG, { fetch: fake.fetch, sleep: async () => {} });
  return { db, raghav, admin, cycleId: c.id, fake, client };
}

describe("draft purchase orders", () => {
  let x: Ctx;
  beforeEach(async () => { x = await setup(); }, 60_000);

  it("is blocked until the review is closed", async () => {
    const y = await setup({ approve: false });
    await expect(createDrafts(y.db, y.cycleId, { client: y.client, now: NOW })).rejects.toMatchObject({ reason: "cycle_open" });
  });
  it("is blocked, with nothing created, while Zoho is not connected", async () => {
    await expect(createDrafts(x.db, x.cycleId, { client: null, now: NOW })).rejects.toMatchObject({ reason: "not_configured" });
    expect(await x.db.select().from(zohoDrafts)).toHaveLength(0);
  });
  it("is still allowed when the stock file is 6 days old", async () => {
    await expect(createDrafts(x.db, x.cycleId, { client: x.client, now: new Date("2026-10-25T05:00:00Z") })).resolves.toBeTruthy();
  });
  it("is blocked when the stock file is 7 days old", async () => {
    const e = await createDrafts(x.db, x.cycleId, { client: x.client, now: new Date("2026-10-26T05:00:00Z") }).catch((err) => err);
    expect(e).toBeInstanceOf(DraftBlocked);
    expect(e.reason).toBe("stale");
  });
  it("is paused by a kill trigger until an Admin acknowledges it", async () => {
    await x.db.insert(killTriggers).values({ code: "test", detail: "test" });
    await expect(createDrafts(x.db, x.cycleId, { client: x.client, now: NOW })).rejects.toMatchObject({ reason: "paused" });
    const [t] = await activeTriggers(x.db);
    await expect(acknowledgeTrigger(x.db, t.id, x.raghav)).rejects.toBeInstanceOf(KillError);
    await acknowledgeTrigger(x.db, t.id, x.admin);
    await expect(createDrafts(x.db, x.cycleId, { client: x.client, now: NOW })).resolves.toBeTruthy();
  });

  it("creates one draft per supplier with one line per approved SKU, and never sends a status", async () => {
    const run = await createDrafts(x.db, x.cycleId, { client: x.client, now: NOW });
    expect(run.failed).toEqual([]);
    expect(run.created.map((c) => c.distributorId)).toEqual(["DIST001", "DIST002"]);
    const posts = x.fake.state.created as { vendor_id: string; reference_number: string; line_items: { item_id: string; quantity: number }[] }[];
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({ vendor_id: "7001", line_items: [{ item_id: "810001", quantity: 750 }] }); // SKU013 has no item mapping
    expect(posts[1]).toMatchObject({ vendor_id: "7002", line_items: [{ item_id: "810003", quantity: 310 }, { item_id: "810004", quantity: 150 }] });
    expect(posts.every((p) => !("status" in p))).toBe(true);
    expect(x.fake.state.calls.every((c) => (c.method === "GET" && c.path.startsWith("/purchaseorders")) || (c.method === "POST" && c.path === "/purchaseorders"))).toBe(true);
    const rows = await x.db.select().from(zohoDrafts);
    expect(rows.every((r) => r.status === "created" && r.zohoStatus === "draft")).toBe(true);
  });
  it("flags what it could not draft, and saves the approval anyway", async () => {
    await createDrafts(x.db, x.cycleId, { client: x.client, now: NOW });
    const ov = await draftOverview(x.db, x.cycleId);
    const by = Object.fromEntries(ov.rows.map((r) => [r.skuId, r]));
    expect(by.SKU001.state).toBe("drafted");
    expect(by.SKU013.state).toBe("flagged");
    expect(by.SKU013.note).toMatch(/not mapped to a Zoho item/);
    expect(by.SKU011.state).toBe("flagged");
    expect(by.SKU011.note).toMatch(/not mapped to a Zoho vendor/);
    const [r13] = await x.db.select().from(recommendations).where(eq(recommendations.skuId, "SKU013"));
    expect(r13.decision).toBe("approved");
    expect(r13.finalQty).toBe(120);
  });
  it("running it again creates nothing new", async () => {
    await createDrafts(x.db, x.cycleId, { client: x.client, now: NOW });
    const again = await createDrafts(x.db, x.cycleId, { client: x.client, now: NOW });
    expect(again.created).toEqual([]);
    expect(x.fake.state.created).toHaveLength(2);
  });
  it("a Zoho outage never loses an approval; retrying later finishes the job", async () => {
    x.fake.state.down = true;
    const run = await createDrafts(x.db, x.cycleId, { client: x.client, now: NOW });
    expect(run.created).toEqual([]);
    expect(run.failed.length).toBe(1); // stops after the first failure instead of hammering Zoho
    const rows = await x.db.select().from(zohoDrafts);
    expect(rows.some((r) => r.status === "failed")).toBe(true);
    const recs = await x.db.select().from(recommendations).where(eq(recommendations.cycleId, x.cycleId));
    expect(recs.every((r) => r.decision !== "pending")).toBe(true);
    x.fake.state.down = false;
    const retry = await createDrafts(x.db, x.cycleId, { client: x.client, now: NOW });
    expect(retry.created.map((c) => c.distributorId).sort()).toEqual(["DIST001", "DIST002"]);
    expect(x.fake.state.created).toHaveLength(2);
  });
  it("adopts an order Zoho already has instead of making a duplicate", async () => {
    x.fake.state.pos.push({ purchaseorder_id: "42", purchaseorder_number: "PO-42", vendor_id: "7001", vendor_name: "V", status: "draft", date: "2026-10-21", reference_number: `FRSP-C${x.cycleId}-DIST001`, line_items: [] });
    const run = await createDrafts(x.db, x.cycleId, { client: x.client, now: NOW });
    expect(run.created.find((c) => c.distributorId === "DIST001")?.poNumber).toBe("PO-42");
    expect(x.fake.state.created).toHaveLength(1); // only DIST002 was posted
  });
  it("reminds after 3 days when an approval has no order in Zoho", async () => {
    expect(await draftReminders(x.db, NOW)).toEqual([]);
    const late = await draftReminders(x.db, new Date(Date.now() + 4 * 86_400_000));
    expect(late.length).toBeGreaterThan(0);
    expect(late[0].days).toBeGreaterThanOrEqual(3);
  });
});

describe("Zoho reads and mapping", () => {
  it("counts open Zoho orders into the next review, and survives Zoho being down", async () => {
    const x = await setup({ approve: false });
    await saveMappings(x.db, { items: { SKU001: "810001" }, vendors: {} });
    x.fake.state.pos.push({ purchaseorder_id: "11", purchaseorder_number: "PO-11", vendor_id: "7001", vendor_name: "A", status: "open", date: "2026-10-18", delivery_date: "2026-10-28", line_items: [{ item_id: "810001", quantity: 400, quantity_received: 100 }] });
    expect(await openOrdersForNewCycle(x.db, 14, { client: x.client, now: NOW })).toEqual({ SKU001: 300 });
    expect((await getSyncState(x.db)).ok).toBe(true);
    x.fake.state.down = true;
    expect(await openOrdersForNewCycle(x.db, 14, { client: x.client, now: NOW })).toBeNull();
    const s = await getSyncState(x.db);
    expect(s.ok).toBe(false);
    expect(s.error).toMatch(/did not answer|busy or down/);
    expect(await openOrdersForNewCycle(x.db, 14, { client: null })).toBeNull(); // not connected
  });
  it("syncOpenOrders never throws", async () => {
    const x = await setup({ approve: false });
    x.fake.state.down = true;
    await expect(syncOpenOrders(x.db, { client: x.client, now: NOW })).resolves.toMatchObject({ ok: false });
  });
  it("validates and saves mappings; a blank removes one", async () => {
    const x = await setup({ approve: false, map: false });
    await expect(saveMappings(x.db, { items: { SKU001: "abc" }, vendors: {} })).rejects.toBeInstanceOf(MappingError);
    await saveMappings(x.db, { items: { SKU001: "810001", SKU002: "" }, vendors: { DIST001: "7000000000001" } });
    expect(await loadMappings(x.db)).toEqual({ items: { SKU001: "810001" }, vendors: { DIST001: "7000000000001" } });
  });
  it("Test connection is read-only and explains problems", async () => {
    const x = await setup({ approve: false });
    expect(await testConnection({ client: x.client })).toEqual({ ok: true, orders: 0 });
    expect(x.fake.state.calls.every((c) => c.method === "GET")).toBe(true);
    expect(await testConnection({ client: null })).toMatchObject({ ok: false, error: expect.stringMatching(/not set up/) });
    const bad = new ZohoClient({ ...CFG, refreshToken: "nope" }, { fetch: x.fake.fetch, sleep: async () => {} });
    forgetToken();
    expect(await testConnection({ client: bad })).toMatchObject({ ok: false, error: expect.stringMatching(/did not accept the saved credentials/) });
  });
});

describe("kill triggers", () => {
  it("1: rejecting 3 of the first 10 stockout recommendations", () => {
    const recs = (rej: number[]) => Array.from({ length: 10 }, (_, i) => ({ id: i + 1, decision: rej.includes(i + 1) ? "rejected" : "approved" }));
    expect(ruleRejectedStockouts(recs([1, 2]))).toBeNull();
    expect(ruleRejectedStockouts(recs([1, 2, 3]))?.code).toBe("rejected_stockouts");
    const eleven = [...recs([1]), { id: 11, decision: "rejected" }, { id: 12, decision: "rejected" }];
    expect(ruleRejectedStockouts(eleven)).toBeNull(); // only the first 10 count
  });
  it("2: a SKU marked fine that stocks out twice in the first 8 weeks", () => {
    const wk = (n: number, rows: { skuId: string; status: string; stock: number }[]) => ({ openedAt: new Date(Date.UTC(2026, 9, 19 + 7 * n)), rows });
    const ok = { skuId: "S1", status: "ok", stock: 100 };
    const out = { skuId: "S1", status: "stockout", stock: 0 };
    expect(ruleRepeatStockouts([wk(0, [ok]), wk(1, [out])])).toEqual([]); // once
    const twice = ruleRepeatStockouts([wk(0, [ok]), wk(1, [out]), wk(2, [ok]), wk(3, [out])]);
    expect(twice.map((f) => f.code)).toEqual(["repeat_stockout:S1"]);
    expect(ruleRepeatStockouts([wk(0, [ok]), wk(1, [out]), wk(2, [ok]), wk(10, [out])])).toEqual([]); // outside 8 weeks
    expect(ruleRepeatStockouts([wk(0, [{ ...ok, status: "stockout" }]), wk(1, [out])])).toEqual([]); // was already flagged
  });
  it("3: losses not down 11% after two full quarters", () => {
    expect(ruleNoImprovement(null)).toBeNull();
    expect(ruleNoImprovement(0.12)).toBeNull();
    expect(ruleNoImprovement(0.05)?.code).toBe("no_improvement");
  });

  it("fires from real decisions, pauses drafts, and only an Admin can clear it", async () => {
    const x = await setup({ approve: false });
    const recs = (await x.db.select().from(recommendations)).filter((r) => r.assessment.status === "stockout" && !r.spotCheck);
    for (const r of recs.slice(0, 2)) await decide(x.db, { recommendationId: r.id, action: "rejected", reason: "Looks wrong" }, x.raghav);
    expect(await isDraftingPaused(x.db)).toBe(false);
    await decide(x.db, { recommendationId: recs[2].id, action: "rejected", reason: "Also wrong" }, x.raghav);
    expect(await isDraftingPaused(x.db)).toBe(true);
    const [t] = await activeTriggers(x.db);
    expect(t.code).toBe("rejected_stockouts");
    expect(await evaluateKillTriggers(x.db)).toEqual([]); // does not fire twice
    await acknowledgeTrigger(x.db, t.id, x.admin);
    expect(await isDraftingPaused(x.db)).toBe(false);
    expect(await evaluateKillTriggers(x.db)).toEqual([]); // stays acknowledged
  });
  it("3 fires from the Results tracker after two full quarters", async () => {
    const x = await setup({ approve: false });
    await saveLoss(x.db, { quarter: "2027-Q1", stockoutLakh: 16, overstockLakh: 12 }, x.raghav); // 28 lakh
    expect(await isDraftingPaused(x.db)).toBe(false);
    await saveLoss(x.db, { quarter: "2027-Q2", stockoutLakh: 16, overstockLakh: 12 }, x.raghav); // 28 vs 31 = 9.7% cut
    expect(await isDraftingPaused(x.db)).toBe(true);
    expect((await activeTriggers(x.db))[0].code).toBe("no_improvement");
    expect(LAKH).toBe(100000);
  });
});
