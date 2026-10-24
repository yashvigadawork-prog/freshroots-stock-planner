import { ZohoClient } from "./client";

export type OpenPo = {
  poId: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  status: string;
  orderDate: string | null;
  expectedDate: string | null;
  referenceNumber: string | null;
  lines: { itemId: string; qty: number; received: number }[];
};

/** Statuses that mean "ordered, not yet fully received". Drafts are not incoming stock. */
const COUNTED = new Set(["open", "issued", "partially_received"]);

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** Read-only: lists open purchase orders with their lines. */
export async function listOpenPurchaseOrders(c: ZohoClient, maxOrders = 100): Promise<OpenPo[]> {
  const out: OpenPo[] = [];
  for (let page = 1; out.length < maxOrders && page <= 5; page++) {
    const body = await c.request("GET", "/purchaseorders", { query: { status: "open", per_page: "50", page: String(page) } });
    const list = (body.purchaseorders as Record<string, unknown>[] | undefined) ?? [];
    for (const po of list) {
      const status = String(po.status ?? "").toLowerCase();
      if (!COUNTED.has(status)) continue;
      const id = String(po.purchaseorder_id);
      const detail = await c.request("GET", `/purchaseorders/${id}`);
      const d = (detail.purchaseorder as Record<string, unknown> | undefined) ?? po;
      const lines = ((d.line_items as Record<string, unknown>[] | undefined) ?? []).map((l) => ({
        itemId: String(l.item_id),
        qty: Number(l.quantity) || 0,
        received: Number(l.quantity_received) || 0,
      }));
      out.push({
        poId: id,
        poNumber: String(po.purchaseorder_number ?? id),
        vendorId: String(po.vendor_id ?? ""),
        vendorName: String(po.vendor_name ?? ""),
        status,
        orderDate: str(po.date),
        expectedDate: str(po.delivery_date),
        referenceNumber: str(po.reference_number),
        lines,
      });
    }
    const more = (body.page_context as Record<string, unknown> | undefined)?.has_more_page;
    if (!more) break;
  }
  return out;
}

/** Read-only: has a purchase order with this reference already been created? (stops duplicates after a lost reply) */
export async function findByReference(c: ZohoClient, reference: string): Promise<{ poId: string; poNumber: string; status: string } | null> {
  const body = await c.request("GET", "/purchaseorders", { query: { reference_number: reference, per_page: "5" } });
  const hit = ((body.purchaseorders as Record<string, unknown>[] | undefined) ?? []).find((p) => p.reference_number === reference);
  return hit ? { poId: String(hit.purchaseorder_id), poNumber: String(hit.purchaseorder_number ?? ""), status: String(hit.status ?? "") } : null;
}

/** Creates ONE new purchase order. Zoho saves new orders as drafts; we never send a status. */
export async function createDraftPurchaseOrder(
  c: ZohoClient,
  p: { vendorId: string; date: string; reference: string; notes: string; lines: { itemId: string; qty: number }[] },
): Promise<{ poId: string; poNumber: string; status: string }> {
  const body = await c.request("POST", "/purchaseorders", {
    json: {
      vendor_id: p.vendorId,
      date: p.date,
      reference_number: p.reference,
      notes: p.notes,
      line_items: p.lines.map((l) => ({ item_id: l.itemId, quantity: l.qty })),
    },
  });
  const po = body.purchaseorder as Record<string, unknown> | undefined;
  if (!po?.purchaseorder_id) throw new Error("Zoho answered but did not return the new order.");
  return { poId: String(po.purchaseorder_id), poNumber: String(po.purchaseorder_number ?? ""), status: String(po.status ?? "draft").toLowerCase() };
}
