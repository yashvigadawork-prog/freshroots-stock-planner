"use client";

import { useActionState } from "react";
import { saveLossAction, type ResultsState } from "./actions";

export default function LossForm({ defaults, canEdit }: { defaults: { quarter: string; stockout: string; overstock: string; note: string }; canEdit: boolean }) {
  const [state, action, pending] = useActionState<ResultsState, FormData>(saveLossAction, null);
  return (
    <form action={action} key={defaults.quarter + defaults.stockout}>
      <div className="rules-grid">
        <label className="num-field">Quarter
          <span className="inp"><input name="quarter" defaultValue={defaults.quarter} placeholder="2027-Q1" pattern="\d{4}-[Qq][1-4]" required disabled={!canEdit} style={{ width: 130 }} /></span>
          <span className="help">Calendar quarters, like 2027-Q1 (Jan to Mar).</span>
        </label>
        <label className="num-field">Stockout loss
          <span className="inp"><input name="stockout" type="number" step="0.01" min="0" defaultValue={defaults.stockout} required disabled={!canEdit} /><span>₹ lakh</span></span>
          <span className="help">Sales lost because stock ran out.</span>
        </label>
        <label className="num-field">Overstock loss
          <span className="inp"><input name="overstock" type="number" step="0.01" min="0" defaultValue={defaults.overstock} required disabled={!canEdit} /><span>₹ lakh</span></span>
          <span className="help">Write-offs, discounts and holding cost on excess stock.</span>
        </label>
      </div>
      <label className="field">Note <span className="req">(optional: how you worked it out)</span>
        <textarea name="note" rows={2} defaultValue={defaults.note} disabled={!canEdit} />
      </label>
      <div className="actions">
        <button className="btn" type="submit" disabled={pending || !canEdit}>{pending ? "Saving…" : "Save this quarter"}</button>
      </div>
      {!canEdit && <div className="alert neutral">The backup approver can read this page. Raghav or an Admin enters the losses.</div>}
      {state && <div className={`alert ${state.ok ? "good" : "error"}`} role={state.ok ? "status" : "alert"}>{state.message}</div>}
    </form>
  );
}
