import type { OpenPo } from "./purchaseOrders";

const DAY = 86_400_000;

export type OrderSummary = {
  /** Open quantity still to arrive, per SKU. Overdue orders are not included. */
  bySku: Record<string, number>;
  /** Orders late by more than the cut-off: left out of cover, flagged. */
  overdue: { poNumber: string; vendorName: string; daysLate: number }[];
  /** Quantity on lines whose Zoho item is not mapped to a SKU (so not counted). */
  unmappedLines: number;
};

/** Open Zoho orders become incoming stock. Overdue by more than `overdueDays` are left out and flagged. */
export function summarizeOpenOrders(pos: OpenPo[], itemToSku: Record<string, string>, now: Date, overdueDays: number): OrderSummary {
  const out: OrderSummary = { bySku: {}, overdue: [], unmappedLines: 0 };
  for (const po of pos) {
    const due = po.expectedDate ?? po.orderDate;
    const daysLate = due ? Math.floor((now.getTime() - Date.parse(`${due}T00:00:00+05:30`)) / DAY) : 0;
    if (daysLate > overdueDays) {
      out.overdue.push({ poNumber: po.poNumber, vendorName: po.vendorName, daysLate });
      continue;
    }
    for (const l of po.lines) {
      const sku = itemToSku[l.itemId];
      if (!sku) {
        out.unmappedLines++;
        continue;
      }
      const left = Math.max(0, l.qty - l.received);
      out.bySku[sku] = (out.bySku[sku] ?? 0) + left;
    }
  }
  return out;
}

export type ApprovedItem = { skuId: string; qty: number; distributorId: string };
export type Skip = { skuId: string; reason: "no_item_mapping" | "no_vendor_mapping" | "supplier_inactive"; text: string };
export type DraftPlan = {
  drafts: { distributorId: string; vendorId: string; lines: { skuId: string; itemId: string; qty: number }[] }[];
  skipped: Skip[];
};

/**
 * One draft per supplier, one line per approved SKU, each SKU at most once.
 * Items that cannot be drafted are skipped and flagged (the approval itself is untouched).
 */
export function planDrafts(
  items: ApprovedItem[],
  maps: { itemBySku: Record<string, string>; vendorByDistributor: Record<string, string>; activeDistributors: Set<string> },
  alreadyDrafted: Set<string> = new Set(),
): DraftPlan {
  const byDist = new Map<string, DraftPlan["drafts"][number]>();
  const skipped: Skip[] = [];
  const seen = new Set<string>(alreadyDrafted);
  for (const it of items) {
    if (it.qty <= 0 || seen.has(it.skuId)) continue;
    seen.add(it.skuId);
    if (!maps.activeDistributors.has(it.distributorId)) {
      skipped.push({ skuId: it.skuId, reason: "supplier_inactive", text: "Supplier is inactive, so no draft was created." });
      continue;
    }
    const vendorId = maps.vendorByDistributor[it.distributorId];
    if (!vendorId) {
      skipped.push({ skuId: it.skuId, reason: "no_vendor_mapping", text: "Supplier is not mapped to a Zoho vendor, so no draft was created." });
      continue;
    }
    const itemId = maps.itemBySku[it.skuId];
    if (!itemId) {
      skipped.push({ skuId: it.skuId, reason: "no_item_mapping", text: "SKU is not mapped to a Zoho item, so no draft was created." });
      continue;
    }
    const d = byDist.get(it.distributorId) ?? { distributorId: it.distributorId, vendorId, lines: [] };
    d.lines.push({ skuId: it.skuId, itemId, qty: it.qty });
    byDist.set(it.distributorId, d);
  }
  return { drafts: [...byDist.values()].sort((a, b) => a.distributorId.localeCompare(b.distributorId)), skipped };
}
