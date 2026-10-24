import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ZohoClient, ZohoError, forgetToken, isAllowed } from "@/lib/zoho/client";
import { getZohoConfig, missingVars, configStatus } from "@/lib/zoho/config";
import { listOpenPurchaseOrders } from "@/lib/zoho/purchaseOrders";
import { planDrafts, summarizeOpenOrders } from "@/lib/zoho/planning";
import { CFG, makeFakeZoho } from "./fakeZoho";

beforeEach(() => forgetToken());
const mk = (fake = makeFakeZoho(), extra = {}) => {
  const sleep = vi.fn(async () => {});
  return { fake, sleep, client: new ZohoClient(CFG, { fetch: fake.fetch, sleep, ...extra }) };
};

describe("settings", () => {
  const full = { ZOHO_CLIENT_ID: "a", ZOHO_CLIENT_SECRET: "b", ZOHO_REFRESH_TOKEN: "c", ZOHO_ORGANIZATION_ID: "d" };
  it("reports what is missing without revealing values", () => {
    expect(missingVars({})).toHaveLength(4);
    expect(getZohoConfig({ ...full, ZOHO_ORGANIZATION_ID: "" })).toBeNull();
    expect(configStatus(full).every((s) => s.set)).toBe(true);
    expect(JSON.stringify(configStatus(full))).not.toMatch(/"b"|"c"/);
  });
  it("India is the default data centre", () => {
    const c = getZohoConfig(full)!;
    expect(c.accountsBase).toBe("https://accounts.zoho.in");
    expect(c.apiBase).toBe("https://www.zohoapis.in/inventory/v1");
    expect(getZohoConfig({ ...full, ZOHO_DC: "com" })!.apiBase).toBe("https://www.zohoapis.com/inventory/v1");
  });
});

describe("what the app may ask Zoho to do", () => {
  it("allows reading purchase orders and creating one, nothing else", () => {
    expect(isAllowed("GET", "/purchaseorders")).toBe(true);
    expect(isAllowed("GET", "/purchaseorders/123456")).toBe(true);
    expect(isAllowed("POST", "/purchaseorders")).toBe(true);
    for (const [m, p] of [["PUT", "/purchaseorders/123"], ["DELETE", "/purchaseorders/123"], ["POST", "/purchaseorders/123/status/open"], ["POST", "/purchaseorders/123/submit"], ["POST", "/purchaseorders/123/approve"], ["GET", "/items"], ["GET", "/contacts"], ["PATCH", "/purchaseorders"]]) {
      expect(isAllowed(m, p)).toBe(false);
    }
  });
  it("blocks a forbidden request before it leaves the app", async () => {
    const { fake, client } = mk();
    await expect(client.request("POST" as "GET", "/purchaseorders/123/status/open")).rejects.toMatchObject({ kind: "blocked" });
    expect(fake.state.calls).toHaveLength(0);
  });
});

describe("talking to Zoho", () => {
  it("gets a token, then reads", async () => {
    const { fake, client } = mk();
    const body = await client.request("GET", "/purchaseorders");
    expect(body.code).toBe(0);
    expect(fake.state.tokenCalls).toBe(1);
    await client.request("GET", "/purchaseorders");
    expect(fake.state.tokenCalls).toBe(1); // token reused
  });
  it("retries with growing waits when Zoho is slow or down, then succeeds", async () => {
    const { fake, client, sleep } = mk();
    fake.state.fail = 2;
    await expect(client.request("GET", "/purchaseorders")).resolves.toBeTruthy();
    expect(sleep.mock.calls.map((c) => (c as unknown[])[0])).toEqual([700, 1400]);
  });
  it("gives up after three tries with a plain message", async () => {
    const { fake, client } = mk();
    fake.state.fail = 5;
    await expect(client.request("GET", "/purchaseorders")).rejects.toMatchObject({ kind: "unavailable" });
    expect(fake.state.calls).toHaveLength(3);
  });
  it("treats a network failure as Zoho being down", async () => {
    const { fake, client } = mk();
    fake.state.down = true;
    await expect(client.request("GET", "/purchaseorders")).rejects.toMatchObject({ kind: "unavailable" });
  });
  it("a bad refresh token is an auth error, is not retried, and leaks no secret", async () => {
    const fake = makeFakeZoho();
    const client = new ZohoClient({ ...CFG, refreshToken: "wrong-token" }, { fetch: fake.fetch, sleep: async () => {} });
    const err = await client.request("GET", "/purchaseorders").catch((e) => e);
    expect(err).toBeInstanceOf(ZohoError);
    expect(err.kind).toBe("auth");
    expect(fake.state.tokenCalls).toBe(1);
    for (const secret of [CFG.clientSecret, "wrong-token", CFG.clientId]) expect(err.message).not.toContain(secret);
  });
  it("gets a fresh token once if the saved one has expired", async () => {
    const { fake, client } = mk();
    await client.request("GET", "/purchaseorders");
    fake.state.tokenValid = "tok-2"; // Zoho rotated it
    await expect(client.request("GET", "/purchaseorders")).resolves.toBeTruthy();
    expect(fake.state.tokenCalls).toBe(2);
  });
  it("shows Zoho's own message when it refuses", async () => {
    const { client } = mk(undefined);
    const bad = new ZohoClient({ ...CFG, organizationId: "999" }, { fetch: makeFakeZoho().fetch, sleep: async () => {} });
    await expect(bad.request("GET", "/purchaseorders")).rejects.toThrow(/Invalid organization/);
    expect(client).toBeTruthy();
  });
});

describe("open orders", () => {
  const po = (over: object) => ({ poId: "1", poNumber: "PO-1", vendorId: "v", vendorName: "NutriFlow", status: "open", orderDate: "2026-10-10", expectedDate: "2026-10-30", referenceNumber: null, lines: [{ itemId: "I1", qty: 100, received: 0 }], ...over });
  const now = new Date("2026-10-24T05:00:00Z");

  it("reads open orders with their lines and ignores drafts", async () => {
    const { fake, client } = mk();
    fake.state.pos.push(
      { purchaseorder_id: "11", purchaseorder_number: "PO-11", vendor_id: "v1", vendor_name: "A", status: "open", date: "2026-10-01", delivery_date: "2026-10-30", line_items: [{ item_id: "9001", quantity: 50, quantity_received: 10 }] },
      { purchaseorder_id: "12", purchaseorder_number: "PO-12", vendor_id: "v1", vendor_name: "A", status: "draft", date: "2026-10-01", line_items: [{ item_id: "9001", quantity: 99 }] },
    );
    const pos = await listOpenPurchaseOrders(client);
    expect(pos.map((p) => p.poNumber)).toEqual(["PO-11"]);
    expect(pos[0].lines).toEqual([{ itemId: "9001", qty: 50, received: 10 }]);
  });
  it("counts what is still to arrive per SKU", () => {
    const s = summarizeOpenOrders([po({ lines: [{ itemId: "I1", qty: 100, received: 30 }] }), po({ poId: "2", lines: [{ itemId: "I1", qty: 20, received: 0 }, { itemId: "ZZ", qty: 5, received: 0 }] })], { I1: "SKU001" }, now, 14);
    expect(s.bySku).toEqual({ SKU001: 90 });
    expect(s.unmappedLines).toBe(1);
  });
  it("leaves out orders overdue by more than 14 days, and flags them", () => {
    const late = po({ poId: "3", poNumber: "PO-LATE", expectedDate: "2026-10-05" }); // 19 days late
    const ok = po({ poId: "4", expectedDate: "2026-10-12" }); // 12 days late: still counted
    const s = summarizeOpenOrders([late, ok], { I1: "SKU001" }, now, 14);
    expect(s.bySku.SKU001).toBe(100);
    expect(s.overdue).toEqual([{ poNumber: "PO-LATE", vendorName: "NutriFlow", daysLate: 19 }]);
  });
});

describe("planning drafts", () => {
  const maps = {
    itemBySku: { SKU001: "I1", SKU013: "I13", SKU003: "I3" },
    vendorByDistributor: { DIST001: "V1", DIST002: "V2" },
    activeDistributors: new Set(["DIST001", "DIST002"]),
  };
  it("one draft per supplier with one line per SKU", () => {
    const p = planDrafts([
      { skuId: "SKU001", qty: 750, distributorId: "DIST001" },
      { skuId: "SKU013", qty: 120, distributorId: "DIST001" },
      { skuId: "SKU003", qty: 300, distributorId: "DIST002" },
    ], maps);
    expect(p.drafts.map((d) => [d.distributorId, d.lines.map((l) => l.skuId)])).toEqual([["DIST001", ["SKU001", "SKU013"]], ["DIST002", ["SKU003"]]]);
    expect(p.skipped).toEqual([]);
  });
  it("a SKU appears once, and zero quantities are ignored", () => {
    const p = planDrafts([
      { skuId: "SKU001", qty: 10, distributorId: "DIST001" },
      { skuId: "SKU001", qty: 20, distributorId: "DIST001" },
      { skuId: "SKU013", qty: 0, distributorId: "DIST001" },
    ], maps);
    expect(p.drafts[0].lines).toEqual([{ skuId: "SKU001", itemId: "I1", qty: 10 }]);
  });
  it("flags unmapped SKUs, unmapped suppliers and inactive suppliers instead of drafting them", () => {
    const p = planDrafts([
      { skuId: "SKU099", qty: 5, distributorId: "DIST001" },
      { skuId: "SKU003", qty: 5, distributorId: "DIST003" },
      { skuId: "SKU001", qty: 5, distributorId: "DIST002" },
    ], { ...maps, activeDistributors: new Set(["DIST001", "DIST002", "DIST004"]), vendorByDistributor: { ...maps.vendorByDistributor, DIST004: "" } });
    expect(p.skipped.map((s) => [s.skuId, s.reason])).toEqual([["SKU099", "no_item_mapping"], ["SKU003", "supplier_inactive"]]);
    expect(p.drafts.map((d) => d.distributorId)).toEqual(["DIST002"]);
  });
});
