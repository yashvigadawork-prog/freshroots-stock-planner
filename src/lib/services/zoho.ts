import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import {
  appState, cycles, recommendations, uploadSnapshots, zohoDrafts, zohoItemMap, zohoOpenOrders, zohoVendorMap,
} from "@/db/schema";
import { getZohoConfig } from "@/lib/zoho/config";
import { ZohoClient, ZohoError } from "@/lib/zoho/client";
import { createDraftPurchaseOrder, findByReference, listOpenPurchaseOrders, type OpenPo } from "@/lib/zoho/purchaseOrders";
import { planDrafts, summarizeOpenOrders, type ApprovedItem, type OrderSummary, type Skip } from "@/lib/zoho/planning";
import { daysSinceDate } from "@/lib/time";
import { isDraftingPaused } from "./kill";

export const STALE_BLOCK_DAYS = 7;
export const REMINDER_DAYS = 3;

export type Deps = { client?: ZohoClient | null; now?: Date };
const clientOf = (d: Deps) => (d.client !== undefined ? d.client : (() => { const c = getZohoConfig(); return c ? new ZohoClient(c) : null; })());

// ---------- reading open orders ----------

export type SyncState = { configured: boolean; at: string | null; ok: boolean | null; error: string | null; orders: number | null };

export async function getSyncState(db: Db): Promise<SyncState> {
  const configured = getZohoConfig() !== null;
  const [row] = await db.select().from(appState).where(eq(appState.key, "zoho_sync"));
  const v = (row?.value ?? {}) as Partial<SyncState>;
  return { configured, at: v.at ?? null, ok: v.ok ?? null, error: v.error ?? null, orders: v.orders ?? null };
}

async function saveSync(db: Db, v: Omit<SyncState, "configured">) {
  await db
    .insert(appState)
    .values({ key: "zoho_sync", value: v })
    .onConflictDoUpdate({ target: appState.key, set: { value: v, updatedAt: new Date() } });
}

/** Reads open orders from Zoho and stores them. Never throws: failures are recorded so the app keeps working. */
export async function syncOpenOrders(db: Db, deps: Deps = {}): Promise<SyncState> {
  const client = clientOf(deps);
  if (!client) return getSyncState(db);
  const at = (deps.now ?? new Date()).toISOString();
  try {
    const pos = await listOpenPurchaseOrders(client);
    await db.transaction(async (tx) => {
      await tx.delete(zohoOpenOrders);
      if (pos.length) {
        await tx.insert(zohoOpenOrders).values(pos.map((p) => ({ ...p, fetchedAt: new Date(at) })));
      }
    });
    await saveSync(db, { at, ok: true, error: null, orders: pos.length });
  } catch (e) {
    const msg = e instanceof ZohoError ? e.message : "Something went wrong talking to Zoho.";
    await saveSync(db, { at, ok: false, error: msg, orders: null });
  }
  return getSyncState(db);
}

async function itemToSkuMap(db: Db): Promise<Record<string, string>> {
  const rows = await db.select().from(zohoItemMap);
  return Object.fromEntries(rows.map((r) => [r.zohoItemId, r.skuId]));
}

export async function cachedOpenOrders(db: Db): Promise<OpenPo[]> {
  const rows = await db.select().from(zohoOpenOrders).orderBy(asc(zohoOpenOrders.poNumber));
  return rows.map(({ poId, poNumber, vendorId, vendorName, status, orderDate, expectedDate, referenceNumber, lines }) => ({
    poId, poNumber, vendorId, vendorName, status, orderDate, expectedDate, referenceNumber, lines,
  }));
}

export async function openOrderSummary(db: Db, overdueDays: number, now = new Date()): Promise<OrderSummary> {
  return summarizeOpenOrders(await cachedOpenOrders(db), await itemToSkuMap(db), now, overdueDays);
}

/**
 * Open order quantity per SKU for a new review. Null when Zoho is not connected or could not be read:
 * the review still starts, and "On order" shows "Not connected".
 */
export async function openOrdersForNewCycle(db: Db, overdueDays: number, deps: Deps = {}): Promise<Record<string, number> | null> {
  if (!clientOf(deps)) return null;
  const state = await syncOpenOrders(db, deps);
  if (!state.ok) return null;
  return (await openOrderSummary(db, overdueDays, deps.now)).bySku;
}

// ---------- draft purchase orders ----------

export type BlockReason = "cycle_open" | "paused" | "stale" | "not_configured";
export class DraftBlocked extends Error {
  constructor(public reason: BlockReason, message: string) {
    super(message);
  }
}

export type ApprovedRow = ApprovedItem & { recId: number; decidedAt: Date | null; skuName: string };

async function approvedItems(db: Db, cycleId: number): Promise<ApprovedRow[]> {
  const [cycle] = await db.select().from(cycles).where(eq(cycles.id, cycleId));
  const [snap] = await db.select().from(uploadSnapshots).where(eq(uploadSnapshots.id, cycle.snapshotId));
  const sku = new Map(snap.dataset.skus.map((s) => [s.skuId, s]));
  const recs = await db
    .select()
    .from(recommendations)
    .where(and(eq(recommendations.cycleId, cycleId), inArray(recommendations.decision, ["approved", "changed"])))
    .orderBy(asc(recommendations.skuId));
  return recs.flatMap((r) => {
    const s = sku.get(r.skuId);
    return s && (r.finalQty ?? 0) > 0
      ? [{ recId: r.id, skuId: r.skuId, skuName: s.name, qty: r.finalQty as number, distributorId: s.distributorId, decidedAt: r.decidedAt }]
      : [];
  });
}

async function loadMaps(db: Db, snapDistributors: { distributorId: string; active: boolean }[]) {
  const [items, vendors] = await Promise.all([db.select().from(zohoItemMap), db.select().from(zohoVendorMap)]);
  return {
    itemBySku: Object.fromEntries(items.map((r) => [r.skuId, r.zohoItemId])),
    vendorByDistributor: Object.fromEntries(vendors.map((r) => [r.distributorId, r.zohoVendorId])),
    activeDistributors: new Set(snapDistributors.filter((d) => d.active).map((d) => d.distributorId)),
  };
}

export type DraftRun = {
  created: { distributorId: string; poNumber: string }[];
  failed: { distributorId: string; error: string }[];
  skipped: Skip[];
};

const todayIst = (now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);

/**
 * Makes DRAFT purchase orders in Zoho for what Raghav approved: one per supplier per review, one line per SKU,
 * each SKU once. Approvals are already saved before this runs, so a Zoho failure never loses one: failed drafts
 * stay in the list and can be retried. Safe to run again: it adopts an order Zoho already has instead of duplicating it.
 */
export async function createDrafts(db: Db, cycleId: number, deps: Deps = {}): Promise<DraftRun> {
  const now = deps.now ?? new Date();
  const [cycle] = await db.select().from(cycles).where(eq(cycles.id, cycleId));
  if (!cycle) throw new DraftBlocked("cycle_open", "That review does not exist.");
  if (cycle.status !== "closed") throw new DraftBlocked("cycle_open", "Close the review first, so each supplier gets one draft with all of its lines.");
  if (await isDraftingPaused(db)) throw new DraftBlocked("paused", "Draft orders are paused by a red-banner safeguard. An Admin needs to acknowledge it first.");
  const [snap] = await db.select().from(uploadSnapshots).where(eq(uploadSnapshots.id, cycle.snapshotId));
  const age = daysSinceDate(snap.asOfDate, now);
  if (age >= STALE_BLOCK_DAYS) throw new DraftBlocked("stale", `The stock file is ${age} days old (the limit is ${STALE_BLOCK_DAYS}). Upload a fresh one before creating drafts.`);
  const client = clientOf(deps);
  if (!client) throw new DraftBlocked("not_configured", "Zoho is not connected, so no drafts were created. Your approvals are saved.");

  const items = await approvedItems(db, cycleId);
  const maps = await loadMaps(db, snap.dataset.distributors);
  const existing = await db.select().from(zohoDrafts).where(eq(zohoDrafts.cycleId, cycleId));
  const draftedSkus = new Set(existing.flatMap((d) => d.lines.map((l) => l.skuId)));
  const suppliersWithRow = new Set(existing.map((d) => d.distributorId));

  const plan = planDrafts(items, maps, draftedSkus);
  const run: DraftRun = { created: [], failed: [], skipped: plan.skipped };

  // A supplier that already has a draft row is only retried as it was; lines are never added to it.
  const todo: { id: number }[] = existing.filter((d) => d.status !== "created").map((d) => ({ id: d.id }));
  for (const d of plan.drafts) {
    if (suppliersWithRow.has(d.distributorId)) continue;
    const [row] = await db
      .insert(zohoDrafts)
      .values({
        cycleId,
        distributorId: d.distributorId,
        status: "pending",
        referenceNumber: `FRSP-C${cycleId}-${d.distributorId}`,
        lines: d.lines.map((l) => ({ skuId: l.skuId, itemId: l.itemId, qty: l.qty })),
      })
      .onConflictDoNothing()
      .returning({ id: zohoDrafts.id });
    if (row) todo.push(row);
  }

  for (const t of todo) {
    const [row] = await db.select().from(zohoDrafts).where(eq(zohoDrafts.id, t.id));
    const vendorId = maps.vendorByDistributor[row.distributorId];
    try {
      if (!vendorId) throw new ZohoError("rejected", "The supplier is no longer mapped to a Zoho vendor.");
      let po = await findByReference(client, row.referenceNumber);
      if (!po) {
        po = await createDraftPurchaseOrder(client, {
          vendorId,
          date: todayIst(now),
          reference: row.referenceNumber,
          notes: `Draft created by Freshroots Stock Planner (review #${cycleId}). Please check before issuing.`,
          lines: row.lines.map((l) => ({ itemId: l.itemId, qty: l.qty })),
        });
      }
      await db
        .update(zohoDrafts)
        .set({ status: "created", zohoPoId: po.poId, zohoPoNumber: po.poNumber, zohoStatus: po.status, error: null, attempts: row.attempts + 1, updatedAt: new Date() })
        .where(eq(zohoDrafts.id, row.id));
      run.created.push({ distributorId: row.distributorId, poNumber: po.poNumber });
    } catch (e) {
      const msg = e instanceof ZohoError ? e.message : "Zoho did not create the order.";
      await db
        .update(zohoDrafts)
        .set({ status: "failed", error: msg, attempts: row.attempts + 1, updatedAt: new Date() })
        .where(eq(zohoDrafts.id, row.id));
      run.failed.push({ distributorId: row.distributorId, error: msg });
      if (e instanceof ZohoError && (e.kind === "unavailable" || e.kind === "auth")) break; // do not hammer a Zoho that is down
    }
  }
  return run;
}

// ---------- what the Zoho orders screen shows ----------

export type ItemState = ApprovedRow & { state: "drafted" | "waiting" | "flagged"; note: string };

export async function draftOverview(db: Db, cycleId: number) {
  const [cycle] = await db.select().from(cycles).where(eq(cycles.id, cycleId));
  const [snap] = await db.select().from(uploadSnapshots).where(eq(uploadSnapshots.id, cycle.snapshotId));
  const items = await approvedItems(db, cycleId);
  const maps = await loadMaps(db, snap.dataset.distributors);
  const drafts = await db.select().from(zohoDrafts).where(eq(zohoDrafts.cycleId, cycleId)).orderBy(asc(zohoDrafts.distributorId));
  const drafted = new Set(drafts.filter((d) => d.status === "created").flatMap((d) => d.lines.map((l) => l.skuId)));
  const queued = new Set(drafts.filter((d) => d.status !== "created").flatMap((d) => d.lines.map((l) => l.skuId)));
  const skipped = new Map(planDrafts(items, maps).skipped.map((s) => [s.skuId, s.text]));
  const suppliers = new Set(drafts.map((d) => d.distributorId));

  const rows: ItemState[] = items.map((it) => {
    if (drafted.has(it.skuId)) return { ...it, state: "drafted", note: "In a draft order" };
    if (queued.has(it.skuId)) return { ...it, state: "waiting", note: "Draft not created yet. Try again." };
    const why = skipped.get(it.skuId);
    if (why) return { ...it, state: "flagged", note: why };
    if (suppliers.has(it.distributorId)) return { ...it, state: "flagged", note: "Its supplier already has a draft for this review, and drafts are never edited. Add this line in Zoho by hand." };
    return { ...it, state: "waiting", note: cycle.status === "closed" ? "Draft not created yet." : "Waiting for the review to be closed." };
  });
  const supplierName = new Map(snap.dataset.distributors.map((d) => [d.distributorId, d.name]));
  return { cycle, drafts, rows, supplierName, asOfDate: snap.asOfDate };
}

/** Approved items with no Zoho order after 3 days. Shown as a reminder. */
export async function draftReminders(db: Db, now = new Date()) {
  const closed = await db.select().from(cycles).where(eq(cycles.status, "closed"));
  const out: { cycleId: number; skuId: string; skuName: string; days: number }[] = [];
  for (const c of closed) {
    const ov = await draftOverview(db, c.id);
    for (const r of ov.rows) {
      if (r.state === "drafted" || !r.decidedAt) continue;
      const days = Math.floor((now.getTime() - r.decidedAt.getTime()) / 86_400_000);
      if (days >= REMINDER_DAYS) out.push({ cycleId: c.id, skuId: r.skuId, skuName: r.skuName, days });
    }
  }
  return out;
}

// ---------- mapping ----------

export class MappingError extends Error {}
const ZOHO_ID = /^\d{6,25}$/;

export async function loadMappings(db: Db) {
  const [items, vendors] = await Promise.all([db.select().from(zohoItemMap), db.select().from(zohoVendorMap)]);
  return {
    items: Object.fromEntries(items.map((r) => [r.skuId, r.zohoItemId])),
    vendors: Object.fromEntries(vendors.map((r) => [r.distributorId, r.zohoVendorId])),
  };
}

/** Saves every row of the mapping form. A blank box removes that mapping. */
export async function saveMappings(db: Db, input: { items: Record<string, string>; vendors: Record<string, string> }) {
  const bad: string[] = [];
  for (const [k, v] of [...Object.entries(input.items), ...Object.entries(input.vendors)]) {
    if (v.trim() && !ZOHO_ID.test(v.trim())) bad.push(`${k}: "${v.trim()}" should be the long number from the Zoho address (digits only).`);
  }
  if (bad.length) throw new MappingError(bad.join(" "));
  await db.transaction(async (tx) => {
    await tx.delete(zohoItemMap);
    await tx.delete(zohoVendorMap);
    const items = Object.entries(input.items).filter(([, v]) => v.trim()).map(([skuId, v]) => ({ skuId, zohoItemId: v.trim() }));
    const vendors = Object.entries(input.vendors).filter(([, v]) => v.trim()).map(([distributorId, v]) => ({ distributorId, zohoVendorId: v.trim() }));
    if (items.length) await tx.insert(zohoItemMap).values(items);
    if (vendors.length) await tx.insert(zohoVendorMap).values(vendors);
  });
}

/** Read-only check used by the "Test connection" button. */
export async function testConnection(deps: Deps = {}): Promise<{ ok: true; orders: number } | { ok: false; error: string }> {
  const client = clientOf(deps);
  if (!client) return { ok: false, error: "Zoho is not set up yet. Some of the four settings are missing (see the list below)." };
  try {
    const body = await client.request("GET", "/purchaseorders", { query: { per_page: "1" } });
    return { ok: true, orders: ((body.purchaseorders as unknown[]) ?? []).length };
  } catch (e) {
    return { ok: false, error: e instanceof ZohoError ? e.message : "Something unexpected went wrong." };
  }
}
