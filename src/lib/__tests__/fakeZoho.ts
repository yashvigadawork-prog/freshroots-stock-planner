import type { ZohoConfig } from "@/lib/zoho/config";

export const CFG: ZohoConfig = {
  clientId: "cid-123",
  clientSecret: "SECRET-VALUE-XYZ",
  refreshToken: "good-refresh-token",
  organizationId: "60001",
  accountsBase: "https://accounts.test",
  apiBase: "https://api.test/inventory/v1",
};

type Po = {
  purchaseorder_id: string; purchaseorder_number: string; vendor_id: string; vendor_name: string;
  status: string; date: string; delivery_date?: string; reference_number?: string;
  line_items: { item_id: string; quantity: number; quantity_received?: number }[];
};

/** A pretend Zoho Inventory: same shapes and quirks as the real API, in memory. */
export function makeFakeZoho() {
  const state = {
    pos: [] as Po[],
    created: [] as Record<string, unknown>[],
    calls: [] as { method: string; path: string }[],
    tokenCalls: 0,
    fail: 0, // answer 503 this many times
    down: false,
    tokenValid: "tok-1",
    nextId: 5000,
  };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  const fakeFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const method = init?.method ?? "GET";
    if (url.host === "accounts.test") {
      state.tokenCalls++;
      const form = new URLSearchParams(String(init?.body));
      if (form.get("refresh_token") !== CFG.refreshToken) return json(200, { error: "invalid_code" });
      return json(200, { access_token: state.tokenValid, expires_in: 3600 });
    }
    const path = url.pathname.replace("/inventory/v1", "");
    state.calls.push({ method, path });
    if (state.down) throw new TypeError("network down");
    if (state.fail > 0) { state.fail--; return json(503, {}); }
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    if (auth !== `Zoho-oauthtoken ${state.tokenValid}`) return json(401, { code: 57, message: "You are not authorized" });
    if (url.searchParams.get("organization_id") !== CFG.organizationId) return json(400, { code: 6, message: "Invalid organization" });

    if (method === "GET" && path === "/purchaseorders") {
      let list = state.pos;
      const ref = url.searchParams.get("reference_number");
      if (ref) list = list.filter((p) => p.reference_number === ref);
      const st = url.searchParams.get("status");
      if (st) list = list.filter((p) => p.status === st);
      return json(200, { code: 0, message: "success", purchaseorders: list.map(({ line_items, ...p }) => p), page_context: { has_more_page: false } });
    }
    const one = /^\/purchaseorders\/(\d+)$/.exec(path);
    if (method === "GET" && one) {
      const po = state.pos.find((p) => p.purchaseorder_id === one[1]);
      return po ? json(200, { code: 0, purchaseorder: po }) : json(404, { code: 1002, message: "Not found" });
    }
    if (method === "POST" && path === "/purchaseorders") {
      const body = JSON.parse(String(init?.body));
      state.created.push(body);
      const id = String(state.nextId++);
      const po: Po = {
        purchaseorder_id: id, purchaseorder_number: `PO-${id}`, vendor_id: body.vendor_id, vendor_name: "Vendor",
        status: "draft", date: body.date, reference_number: body.reference_number,
        line_items: body.line_items,
      };
      state.pos.push(po);
      return json(201, { code: 0, message: "The purchase order has been created.", purchaseorder: po });
    }
    return json(404, { code: 5, message: "Invalid URL" });
  };
  return { state, fetch: fakeFetch };
}
