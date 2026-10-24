import Link from "next/link";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import { listLosses } from "@/lib/services/results";
import { BASELINE_HIGH, BASELINE_LOW, LAKH, fullQuarterLabels, reductionVsBaseline, roleOf, verdict, formatLakh } from "@/lib/results";
import ResultsChart from "@/components/ResultsChart";
import LossForm from "./LossForm";

export const dynamic = "force-dynamic";

const ROLE_TEXT = { before: "Before launch", launch: "Launch quarter (part)", full1: "Full quarter 1", full2: "Full quarter 2", later: "Later" } as const;

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  const db = await getDb();
  const { actor } = await getActor(db);
  const rows = await listLosses(db);
  const [q1, q2] = fullQuarterLabels();
  const editing = rows.find((r) => r.quarter === edit);
  const defaults = editing
    ? { quarter: editing.quarter, stockout: String(editing.stockoutInr / LAKH), overstock: String(editing.overstockInr / LAKH), note: editing.note ?? "" }
    : { quarter: rows.length ? "" : q1, stockout: "", overstock: "", note: "" };

  const second = rows.find((r) => r.quarter === q2);
  const cutText = second ? `${(reductionVsBaseline(second.stockoutInr + second.overstockInr) * 100).toFixed(0)}%` : "Not entered yet";

  return (
    <main className="page">
      <h1>Results tracker</h1>
      <p className="muted">Is the planner paying for itself? Raghav types in each quarter&apos;s losses. Nothing here is estimated by the app.</p>

      <div className="stats rise">
        <div className="stat"><span className="small muted">Baseline (before the planner)</span><b>₹28 to 34 lakh</b><span className="small muted">lost per quarter to stockouts and overstock</span></div>
        <div className="stat"><span className="small muted">Target: cut by 25%</span><b>₹7 to 8.5 lakh</b><span className="small muted">saved each quarter, so losses of ₹21 to 25.5 lakh</span></div>
        <div className="stat"><span className="small muted">Cut so far, full quarter 2 ({q2})</span><b>{cutText}</b><span className="small muted">measured against the middle of the baseline (₹31 lakh)</span></div>
      </div>

      <section className="card rise">
        <h2>Losses by quarter</h2>
        <ResultsChart bars={rows} />
      </section>

      <section className="card rise">
        <h2>{editing ? `Correct ${editing.quarter}` : "Enter a quarter"}</h2>
        <p className="muted small">The first full quarter after launch is {q1}; the second is {q2}. Entering a quarter again corrects it.</p>
        <LossForm defaults={defaults} canEdit={actor.role !== "backup"} />
      </section>

      <section className="card rise">
        <h2>Entered quarters</h2>
        {rows.length === 0 ? (
          <p className="muted">Nothing entered yet. Add the first quarter above.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Quarter</th><th className="num">Stockout</th><th className="num">Overstock</th><th className="num">Combined</th><th>Against the target</th><th /></tr></thead>
              <tbody>
                {[...rows].reverse().map((r) => {
                  const total = r.stockoutInr + r.overstockInr;
                  const v = verdict(r.quarter, total);
                  return (
                    <tr key={r.quarter}>
                      <td><strong>{r.quarter}</strong><br /><span className="small muted">{ROLE_TEXT[roleOf(r.quarter)]}</span></td>
                      <td className="num">{formatLakh(r.stockoutInr)}</td>
                      <td className="num">{formatLakh(r.overstockInr)}</td>
                      <td className="num"><strong>{formatLakh(total)}</strong></td>
                      <td><span className={`badge ${v.tone === "good" ? "ok" : v.tone === "bad" ? "stockout" : v.tone === "warn" ? "overstock" : "judgment"}`}>{v.tone === "good" ? "On target" : v.tone === "bad" ? "Off target" : v.tone === "warn" ? "Behind" : "Info"}</span> <span className="small">{v.text}</span>{r.note && <><br /><span className="small muted">Note: {r.note}</span></>}</td>
                      <td><Link href={`/results?edit=${r.quarter}`}>Correct</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted">Baseline range: {formatLakh(BASELINE_LOW)} to {formatLakh(BASELINE_HIGH)} per quarter. If two full quarters pass and losses have not fallen by at least 11 to 13 percent, the project is paused for review.</p>
      </section>
    </main>
  );
}
