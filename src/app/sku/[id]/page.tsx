import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { loadWorkspace } from "@/lib/services/workspace";
import { listDecisions } from "@/lib/services/log";
import { formatWhen } from "@/lib/time";
import SnackIcon from "@/components/SnackIcon";
import StatusBadge from "@/components/StatusBadge";
import SalesChart from "@/components/SalesChart";
import Trace from "@/components/Trace";

export const dynamic = "force-dynamic";

const ACTION: Record<string, string> = { approved: "Approved", changed: "Changed", rejected: "Rejected" };

export default async function SkuPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const ws = await loadWorkspace(db);
  const row = ws?.rows.find((r) => r.sku.skuId === decodeURIComponent(id));
  if (!ws || !row) notFound();
  const { sku, input, a, supplierName } = row;
  const history = await listDecisions(db, { skuId: sku.skuId });
  const settings = ws.rules.settings;

  return (
    <main className="page">
      <p className="small"><Link href="/">← Home</Link></p>
      <header className="sku-head rise">
        <SnackIcon category={sku.category} size={44} />
        <div>
          <h1>{sku.name.replace("Freshroots ", "")}</h1>
          <p className="muted">{sku.skuId} · {sku.category} · {supplierName}{a.perishable ? " · Perishable" : ""}</p>
        </div>
        <StatusBadge status={a.status} highDemand={a.highDemand} />
      </header>

      <section className="card rise">
        <h2>Why it is flagged this way</h2>
        <p className="why">{a.reason}</p>
        <dl className="facts">
          <div><dt>In stock</dt><dd>{input.stockOnHand.toLocaleString("en-IN")}</dd></div>
          <div><dt>On order</dt><dd>{input.openOrderQty === null ? "Not connected" : input.openOrderQty.toLocaleString("en-IN")}</dd></div>
          <div><dt>Average a week</dt><dd>{a.avgWeeklySales === null ? "–" : <Trace label="Average weekly sales" value={a.avgWeeklySales.toFixed(1)} lines={a.trace.slice(0, 1)} />}</dd></div>
          <div><dt>Weeks of cover</dt><dd>{a.weeksOfCover === null ? "n/a" : <Trace label="Weeks of cover" value={a.weeksOfCover.toFixed(1)} lines={a.trace} />}</dd></div>
          <div><dt>Target band</dt><dd>{a.band.min}–{a.band.max} weeks</dd></div>
          <div><dt>Standard reorder</dt><dd>{sku.standardReorderQty.toLocaleString("en-IN")}</dd></div>
        </dl>
        {a.flags.map((f) => <p key={f.code} className="small muted flag">• {f.text}</p>)}
        <h3 className="section-sm">Which rule fired</h3>
        <ol className="rule-trace">
          {a.trace.map((l, i) => (
            <li key={i}><span className="small muted">{l.label}</span><br />{l.formula} <b>→ {l.value}</b></li>
          ))}
        </ol>
        <p className="small muted">Rules version {ws.rules.version}. Festival uplift {settings.festivalUplift}× is {input.isFestivalMonth ? "on" : "off"} this month.</p>
      </section>

      <section className="card rise">
        <h2>Last 16 weeks of sales</h2>
        <p className="muted small">Dark bars are the {settings.avgWindowWeeks} weeks that make the average. Lighter bars are older and not averaged.</p>
        <SalesChart weeks={input.weeks} labels={ws.weekLabels} average={a.avgWeeklySales} avgWindow={settings.avgWindowWeeks} />
        <details className="how">
          <summary>See the numbers</summary>
          <table>
            <thead><tr><th>Week</th><th className="num">Units sold</th></tr></thead>
            <tbody>
              {input.weeks.map((v, i) => (
                <tr key={ws.weekLabels[i]}><td>{ws.weekLabels[i]}</td><td className="num">{v === null ? "Missing" : v}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <section className="card rise">
        <h2>Past decisions for this SKU</h2>
        {history.length === 0 ? (
          <p className="muted">No decisions yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>When</th><th>Decision</th><th className="num">Rule said</th><th className="num">Final</th><th>By</th><th>Reason</th><th className="num">Rules</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>{formatWhen(h.at)}</td>
                    <td>{ACTION[h.action]}</td>
                    <td className="num">{h.ruleQty ?? "–"}</td>
                    <td className="num">{h.finalQty ?? "–"}</td>
                    <td>{h.who}{h.asBackup && <span className="small muted"> (backup)</span>}</td>
                    <td className="small">{h.reason ?? "–"}</td>
                    <td className="num">v{h.ruleVersion}</td>
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
