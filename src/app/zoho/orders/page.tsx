import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { cycles, ruleVersions, zohoDrafts } from "@/db/schema";
import { cachedOpenOrders, draftOverview, getSyncState, openOrderSummary } from "@/lib/services/zoho";
import { formatWhen } from "@/lib/time";
import ZohoBanner from "@/components/ZohoBanner";
import ZohoActions from "./ZohoActions";

export const dynamic = "force-dynamic";

const STATE_BADGE = { drafted: "ok", waiting: "overstock", flagged: "stockout" } as const;
const STATE_TEXT = { drafted: "Drafted", waiting: "Waiting", flagged: "Flagged" } as const;

export default async function ZohoOrdersPage() {
  const db = await getDb();
  const [state, [latest]] = await Promise.all([getSyncState(db), db.select().from(cycles).orderBy(desc(cycles.id)).limit(1)]);
  const overview = latest ? await draftOverview(db, latest.id) : null;
  const [rules] = latest ? await db.select().from(ruleVersions).where(eq(ruleVersions.id, latest.ruleVersionId)) : [null];
  const [pos, summary, drafts] = await Promise.all([
    cachedOpenOrders(db),
    openOrderSummary(db, rules?.settings.overdueOrderDays ?? 14),
    db.select().from(zohoDrafts).orderBy(desc(zohoDrafts.id)),
  ]);
  const overdue = new Set(summary.overdue.map((o) => o.poNumber));

  return (
    <main className="page">
      <h1>Zoho orders</h1>
      <p className="muted">Open purchase orders count as incoming stock. This app only reads orders and creates <strong>draft</strong> orders; it never issues, edits or deletes anything in Zoho.</p>
      <ZohoBanner />

      <section className="card">
        <ZohoActions cycleId={latest?.id ?? null} canCreate={latest?.status === "closed" && state.configured} />
        <p className="small muted">Item and supplier mapping: <Link href="/zoho/mapping">open the mapping screen</Link>. Connection help: <Link href="/zoho/connection">Zoho connection</Link>.</p>
      </section>

      <section className="card">
        <h2>Draft orders made by this app</h2>
        {drafts.length === 0 ? <p className="muted">None yet.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Review</th><th>Supplier</th><th>Zoho order</th><th>Status</th><th>Lines</th><th>Made</th></tr></thead>
            <tbody>{drafts.map((d) => (
              <tr key={d.id}>
                <td>#{d.cycleId}</td>
                <td>{overview?.supplierName.get(d.distributorId) ?? d.distributorId}</td>
                <td>{d.zohoPoNumber ?? "–"}</td>
                <td>
                  <span className={`badge ${d.status === "created" ? "ok" : d.status === "failed" ? "stockout" : "overstock"}`}>{d.status === "created" ? "Created" : d.status === "failed" ? "Failed" : "Pending"}</span>
                  {d.zohoStatus && <span className="small muted"> Zoho says: {d.zohoStatus}</span>}
                  {d.error && <div className="small">{d.error}</div>}
                </td>
                <td className="small">{d.lines.map((l) => `${l.skuId} × ${l.qty}`).join(", ")}</td>
                <td className="small">{formatWhen(d.updatedAt)}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </section>

      {overview && (
        <section className="card">
          <h2>Approved items in review #{overview.cycle.id}</h2>
          {overview.rows.length === 0 ? <p className="muted">Nothing approved for ordering yet.</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th>SKU</th><th className="num">Quantity</th><th>Supplier</th><th>Order status</th></tr></thead>
              <tbody>{overview.rows.map((r) => (
                <tr key={r.skuId}>
                  <td><Link href={`/sku/${r.skuId}`}>{r.skuName.replace("Freshroots ", "")}</Link><br /><span className="small muted">{r.skuId}</span></td>
                  <td className="num">{r.qty}</td>
                  <td>{overview.supplierName.get(r.distributorId) ?? r.distributorId}</td>
                  <td><span className={`badge ${STATE_BADGE[r.state]}`}>{STATE_TEXT[r.state]}</span> <span className="small">{r.note}</span></td>
                </tr>))}</tbody>
            </table></div>
          )}
        </section>
      )}

      <section className="card">
        <h2>Open orders in Zoho</h2>
        {!state.configured ? <p className="muted">Not connected.</p> : pos.length === 0 ? <p className="muted">No open orders were found{state.at ? ` when last read (${formatWhen(new Date(state.at))})` : ""}.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Order</th><th>Supplier</th><th>Expected</th><th className="num">Units still to arrive</th><th>Counted?</th></tr></thead>
            <tbody>{pos.map((p) => (
              <tr key={p.poId}>
                <td>{p.poNumber}</td><td>{p.vendorName}</td><td>{p.expectedDate ?? "–"}</td>
                <td className="num">{p.lines.reduce((n, l) => n + Math.max(0, l.qty - l.received), 0)}</td>
                <td>{overdue.has(p.poNumber) ? <><span className="badge stockout">Overdue</span> <span className="small">More than {rules?.settings.overdueOrderDays ?? 14} days late, so left out of cover.</span></> : <span className="badge ok">Counted</span>}</td>
              </tr>))}</tbody>
          </table></div>
        )}
        {summary.unmappedLines > 0 && <p className="small muted">{summary.unmappedLines} order line{summary.unmappedLines === 1 ? "" : "s"} use Zoho items that are not mapped to a SKU, so they are not counted. <Link href="/zoho/mapping">Map them</Link>.</p>}
      </section>
    </main>
  );
}
