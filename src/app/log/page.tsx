import Link from "next/link";
import { getDb } from "@/db";
import { listDecisions } from "@/lib/services/log";
import { formatWhen } from "@/lib/time";

export const dynamic = "force-dynamic";

const ACTION: Record<string, string> = { approved: "Approved", changed: "Changed", rejected: "Rejected" };

export default async function LogPage({ searchParams }: { searchParams: Promise<{ sku?: string; action?: string }> }) {
  const sp = await searchParams;
  const db = await getDb();
  const rows = await listDecisions(db, { skuId: sp.sku?.trim() || undefined, action: sp.action });
  const qs = new URLSearchParams();
  if (sp.sku) qs.set("sku", sp.sku);
  if (sp.action) qs.set("action", sp.action);

  return (
    <main className="page">
      <h1>Decision log</h1>
      <p className="muted">Every approve, change and reject: who, when, why, and which version of the rules was in force. Entries are never edited or deleted.</p>

      <form className="card filters" method="get">
        <label>SKU
          <input name="sku" defaultValue={sp.sku ?? ""} placeholder="e.g. SKU004" />
        </label>
        <label>Decision
          <select name="action" defaultValue={sp.action ?? ""}>
            <option value="">All</option>
            <option value="approved">Approved</option>
            <option value="changed">Changed</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <button className="btn secondary" type="submit">Filter</button>
        <a className="btn ghost" href={`/log/export${qs.size ? `?${qs}` : ""}`}>Download CSV</a>
      </form>

      <section className="card">
        {rows.length === 0 ? (
          <p className="muted">Nothing here yet. Decisions appear as soon as you answer a card on the <Link href="/review">Review list</Link>.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>When</th><th>SKU</th><th>Decision</th><th className="num">Rule said</th><th className="num">Final</th><th>By</th><th>Reason</th><th className="num">Rules</th><th className="num">Review</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{formatWhen(r.at)}</td>
                    <td><Link href={`/sku/${r.skuId}`}>{r.skuId}</Link></td>
                    <td><span className={`badge ${r.action === "rejected" ? "stockout" : r.action === "changed" ? "overstock" : "ok"}`}>{ACTION[r.action]}</span></td>
                    <td className="num">{r.ruleQty ?? "–"}</td>
                    <td className="num">{r.finalQty ?? "–"}</td>
                    <td>{r.who}{r.asBackup && <><br /><span className="small muted">acted as backup</span></>}</td>
                    <td className="small">{r.reason ?? "–"}</td>
                    <td className="num">v{r.ruleVersion}</td>
                    <td className="num">#{r.cycleId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
