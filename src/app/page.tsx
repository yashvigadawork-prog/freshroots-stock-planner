import Link from "next/link";
import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import { loadWorkspace, REVIEW_OVERDUE_DAYS, STALE_BLOCK_DAYS, STALE_WARN_DAYS } from "@/lib/services/workspace";
import { daysSince, greeting } from "@/lib/time";
import Rooty from "@/components/Rooty";
import SnackIcon from "@/components/SnackIcon";
import StatusBadge from "@/components/StatusBadge";
import CoverBar from "@/components/CoverBar";
import Trace from "@/components/Trace";
import ZohoBanner from "@/components/ZohoBanner";

export const dynamic = "force-dynamic";

export default async function Home() {
  const db = await getDb();
  const { actor } = await getActor(db);
  const ws = await loadWorkspace(db);

  if (!ws) {
    return (
      <main className="page">
        <h1>Welcome</h1>
        <p>No data yet. <Link href="/upload">Upload your CSVs</Link> to begin.</p>
      </main>
    );
  }

  const { rows, progress, openCycle, staleDays, snapshot, rules } = ws;
  const count = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;
  const tiles = [
    { label: "Stockout risk", value: count((r) => r.a.status === "stockout"), cls: "stockout" },
    { label: "Overstock risk", value: count((r) => r.a.status === "overstock"), cls: "overstock" },
    { label: "High demand", value: count((r) => r.a.highDemand), cls: "high" },
    { label: "Needs judgment", value: count((r) => r.a.status === "needs_judgment"), cls: "judgment" },
    { label: "SKUs tracked", value: rows.length, cls: "plain" },
  ];
  const reviewAge = openCycle ? daysSince(openCycle.openedAt) : 0;

  return (
    <main className="page">
      <section className="hero rise">
        <div>
          <h1>{greeting()}, {actor.name.split(" ")[0]}.</h1>
          <p className="muted lead">
            {openCycle
              ? "Here is how the shelves look this week. Your review is waiting."
              : "Here is how the shelves look this week."}
          </p>
        </div>
        <div className="rooty-wrap"><Rooty size={92} /></div>
      </section>

      {staleDays >= STALE_BLOCK_DAYS ? (
        <div className="alert error" role="alert">
          <strong>Stock file is {staleDays} days old.</strong> Draft orders are blocked until you upload a fresh stock file. <Link href="/upload">Upload data</Link>
        </div>
      ) : staleDays >= STALE_WARN_DAYS ? (
        <div className="alert warn" role="status">
          <strong>Stock file is {staleDays} days old.</strong> Upload a fresh one soon. Draft orders are blocked at {STALE_BLOCK_DAYS} days. <Link href="/upload">Upload data</Link>
        </div>
      ) : null}

      <ZohoBanner />

      {openCycle && progress && (
        <div className={`alert ${reviewAge >= REVIEW_OVERDUE_DAYS ? "warn" : "good"}`} role="status">
          <strong>
            Review: {progress.answered} of {progress.total} answered.
          </strong>{" "}
          {reviewAge >= REVIEW_OVERDUE_DAYS && <>It has been open {reviewAge} days (aim for {REVIEW_OVERDUE_DAYS}). </>}
          <Link href="/review">Go to review</Link>
        </div>
      )}

      <ul className="tiles">
        {tiles.map((t, i) => (
          <li key={t.label} className={`tile ${t.cls} rise`} style={{ animationDelay: `${i * 60}ms` }}>
            <span className="tile-num">{t.value}</span>
            <span className="tile-label">
              {t.cls !== "plain" && <i className={`dot ${t.cls}`} aria-hidden="true" />}
              {t.label}
            </span>
          </li>
        ))}
      </ul>

      <section className="card rise">
        <h2>All SKUs</h2>
        <p className="muted small">
          Stock date {snapshot.asOfDate} · rules version {rules.version} · festival uplift applied where the month is a festival month. Click a number to see how it was worked out.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Status</th>
                <th className="num">In stock</th>
                <th className="num">On order</th>
                <th className="num">Avg / week</th>
                <th>Weeks of cover</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ sku, supplierName, input, a }) => (
                <tr key={sku.skuId}>
                  <td>
                    <div className="skucell">
                      <SnackIcon category={sku.category} />
                      <div>
                        <Link href={`/sku/${sku.skuId}`}><strong>{sku.name.replace("Freshroots ", "")}</strong></Link>
                        <br />
                        <span className="small muted">{sku.skuId} · {supplierName}</span>
                      </div>
                    </div>
                  </td>
                  <td><StatusBadge status={a.status} highDemand={a.highDemand} /></td>
                  <td className="num">{input.stockOnHand.toLocaleString("en-IN")}</td>
                  <td className="num">{input.openOrderQty === null ? <span className="small muted">Not connected</span> : input.openOrderQty.toLocaleString("en-IN")}</td>
                  <td className="num">{a.avgWeeklySales === null ? "–" : <Trace label="Average weekly sales" value={a.avgWeeklySales.toFixed(1)} lines={a.trace.slice(0, 1)} />}</td>
                  <td>
                    <div className="coverrow">
                      <CoverBar a={a} />
                      {a.weeksOfCover !== null ? <Trace label="Weeks of cover" value={a.weeksOfCover.toFixed(1)} lines={a.trace} /> : <span className="muted">n/a</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
