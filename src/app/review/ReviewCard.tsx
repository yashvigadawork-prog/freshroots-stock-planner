"use client";

import { useState, useTransition } from "react";
import SnackIcon from "@/components/SnackIcon";
import { decideAction } from "./actions";

export type CardData = {
  id: number;
  skuId: string;
  name: string;
  category: string;
  supplier: string;
  status: "stockout" | "overstock" | "needs_judgment" | "ok";
  highDemand: boolean;
  spotCheck: boolean;
  reason: string;
  ruleQty: number | null;
  standardQty: number;
  cover: number | null;
  eff: number | null;
  band: { min: number; max: number };
  warning: string | null;
  flags: string[];
  trace: { label: string; formula: string; value: string }[];
  decision: "pending" | "approved" | "changed" | "rejected";
  finalQty: number | null;
  decisionReason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
};

const STATUS_TEXT = { stockout: "Stockout risk", overstock: "Overstock risk", needs_judgment: "Needs judgment", ok: "OK" } as const;
const STATUS_CLASS = { stockout: "stockout", overstock: "overstock", needs_judgment: "judgment", ok: "ok" } as const;
const STEP = 10;

function coverAfterText(c: CardData, qty: number): { text: string; warn: string | null } | null {
  if (c.cover === null || !c.eff) return null;
  const after = c.cover + qty / c.eff;
  let warn: string | null = null;
  if (after < c.band.min) warn = `Still under the ${c.band.min}-week minimum.`;
  else if (after > c.band.max) warn = `Above the ${c.band.max}-week limit.`;
  return { text: `${after.toFixed(2)} weeks`, warn };
}

export default function ReviewCard({ card }: { card: CardData }) {
  const [mode, setMode] = useState<null | "change" | "reject">(null);
  const [qty, setQty] = useState(card.ruleQty ?? card.standardQty);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [reopened, setReopened] = useState(false);
  const answered = card.decision !== "pending" && !reopened && mode === null;
  const after = coverAfterText(card, qty);
  const judgment = card.status === "needs_judgment";

  function send(action: "approved" | "changed" | "rejected") {
    setError(null);
    start(async () => {
      const res = await decideAction({ recommendationId: card.id, action, qty: action === "changed" ? qty : null, reason });
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        setMode(null);
        setReason("");
        setReopened(false);
      }
    });
  }

  return (
    <article className={`card rcard rise ${card.status}${card.decision !== "pending" ? " done" : ""}`} aria-labelledby={`h-${card.id}`}>
      <div className="rcard-head">
        <SnackIcon category={card.category} size={34} />
        <div className="rcard-title">
          <h3 id={`h-${card.id}`}><a href={`/sku/${card.skuId}`}>{card.name.replace("Freshroots ", "")}</a></h3>
          <span className="small muted">{card.skuId} · {card.supplier}</span>
        </div>
        <span className="badges">
          {card.spotCheck && <span className="badge spot">Spot-check</span>}
          <span className={`badge ${STATUS_CLASS[card.status]}`}>{STATUS_TEXT[card.status]}</span>
          {card.highDemand && <span className="badge high">High demand</span>}
        </span>
      </div>

      <p className="why">
        {card.spotCheck ? "This SKU was not flagged. " : ""}
        {card.reason}
      </p>

      <dl className="facts">
        <div><dt>Weeks of cover now</dt><dd>{card.cover === null ? "n/a" : card.cover.toFixed(1)}</dd></div>
        {card.ruleQty !== null && <div><dt>Recommended order</dt><dd>{card.ruleQty.toLocaleString("en-IN")} units</dd></div>}
        {card.ruleQty !== null && card.cover !== null && card.eff ? (
          <div><dt>Cover after order</dt><dd>{(card.cover + card.ruleQty / card.eff).toFixed(2)} weeks</dd></div>
        ) : null}
        <div><dt>Target band</dt><dd>{card.band.min}–{card.band.max} weeks</dd></div>
      </dl>

      {card.warning && <div className="alert warn" role="status"><strong>Heads up:</strong> {card.warning} You can still approve.</div>}
      {card.flags.map((f) => <p key={f} className="small muted flag">• {f}</p>)}

      <details className="how">
        <summary>How was this worked out?</summary>
        <ol>{card.trace.map((l, i) => <li key={i}><span className="small muted">{l.label}</span><br />{l.formula} <b>→ {l.value}</b></li>)}</ol>
      </details>

      {answered ? (
        <div className="answered">
          <span className={`badge ${card.decision === "rejected" ? "stockout" : "ok"}`}>
            {card.decision === "approved" ? (card.spotCheck ? "Looks right" : "Approved") : card.decision === "changed" ? "Changed" : card.spotCheck ? "Not right" : "Rejected"}
          </span>
          <span>
            {card.finalQty !== null && card.decision !== "rejected" && <>{card.finalQty.toLocaleString("en-IN")} units · </>}
            by {card.decidedBy}{card.decidedAt && <>, {card.decidedAt}</>}
            {card.decisionReason && <> — “{card.decisionReason}”</>}
          </span>
          <button className="btn ghost" onClick={() => setReopened(true)}>Change answer</button>
        </div>
      ) : (
        <>
          {mode === null && (
            <div className="actions">
              {card.spotCheck ? (
                <>
                  <button className="btn" disabled={pending} onClick={() => send("approved")}>Looks right</button>
                  <button className="btn danger" disabled={pending} onClick={() => setMode("reject")}>Not right</button>
                </>
              ) : (
                <>
                  {!judgment && <button className="btn" disabled={pending} onClick={() => send("approved")}>{card.status === "overstock" ? "Approve pause" : "Approve"}</button>}
                  <button className="btn secondary" disabled={pending} onClick={() => setMode("change")}>{judgment ? "Set a quantity" : "Change"}</button>
                  <button className="btn danger" disabled={pending} onClick={() => setMode("reject")}>{judgment ? "No order" : "Reject"}</button>
                </>
              )}
            </div>
          )}

          {mode === "change" && (
            <div className="panel">
              <div className="stepper" role="group" aria-label="Order quantity">
                <button type="button" className="btn secondary round" aria-label={`Decrease by ${STEP}`} onClick={() => setQty((q) => Math.max(0, q - STEP))}>−</button>
                <input aria-label="Order quantity" inputMode="numeric" value={qty} onChange={(e) => setQty(Math.max(0, Math.floor(Number(e.target.value.replace(/\D/g, "")) || 0)))} />
                <button type="button" className="btn secondary round" aria-label={`Increase by ${STEP}`} onClick={() => setQty((q) => q + STEP)}>+</button>
                <span className="muted">units</span>
              </div>
              {after && (
                <p className={after.warn ? "amber" : "small muted"}>
                  Cover after this order: <strong>{after.text}</strong>{after.warn && <> — {after.warn} You can still approve.</>}
                </p>
              )}
              <label className="field">Why are you changing this? <span className="req">(required)</span>
                <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <div className="actions">
                <button className="btn" disabled={pending} onClick={() => send("changed")}>Save change</button>
                <button className="btn ghost" disabled={pending} onClick={() => { setMode(null); setError(null); }}>Cancel</button>
              </div>
            </div>
          )}

          {mode === "reject" && (
            <div className="panel">
              <label className="field">{card.spotCheck ? "What looks wrong?" : judgment ? "Why no order?" : "Why are you rejecting this?"} <span className="req">(required)</span>
                <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <div className="actions">
                <button className="btn danger" disabled={pending} onClick={() => send("rejected")}>{card.spotCheck ? "Confirm not right" : judgment ? "Confirm no order" : "Confirm reject"}</button>
                <button className="btn ghost" disabled={pending} onClick={() => { setMode(null); setError(null); }}>Cancel</button>
              </div>
            </div>
          )}
        </>
      )}

      {error && <div className="alert error" role="alert">{error}</div>}
    </article>
  );
}
