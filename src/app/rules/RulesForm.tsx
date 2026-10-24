"use client";

import { useActionState } from "react";
import { RULE_FIELDS, toDisplay } from "@/lib/rules/fields";
import type { RuleSettings } from "@/lib/rules/types";
import { saveRulesAction, type RulesState } from "./actions";

const GROUPS = ["Cover bands", "Demand", "Needs judgment", "Zoho"] as const;

export default function RulesForm({ settings, canEdit }: { settings: RuleSettings; canEdit: boolean }) {
  const [state, action, pending] = useActionState<RulesState, FormData>(saveRulesAction, null);
  return (
    <form action={action}>
      {GROUPS.map((g) => (
        <fieldset key={g} className="card" style={{ border: "1px solid var(--line)" }}>
          <legend><h2 style={{ margin: 0, padding: "0 6px" }}>{g}</h2></legend>
          <div className="rules-grid">
            {RULE_FIELDS.filter((f) => f.group === g).map((f) => (
              <label className="num-field" key={f.key}>
                {f.label}
                <span className="inp">
                  <input name={f.key} type="number" inputMode="decimal" step={f.step} defaultValue={toDisplay(f, settings[f.key])} disabled={!canEdit} required />
                  <span>{f.unit}</span>
                </span>
                <span className="help">{f.help}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {canEdit ? (
        <div className="card">
          <label className="field">Why are you changing the rules? <span className="req">(required, saved in the history)</span>
            <textarea name="changeNote" rows={2} required />
          </label>
          <div className="actions"><button className="btn" type="submit" disabled={pending}>{pending ? "Saving…" : "Save as a new version"}</button></div>
        </div>
      ) : (
        <div className="alert neutral">Only an Admin can change these. Use the &ldquo;Working as&rdquo; picker at the top to switch to Admin.</div>
      )}
      {state && !state.ok && (
        <div className="alert error" role="alert"><strong>Not saved:</strong><ul>{state.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>
      )}
      {state?.ok && <div className="alert good" role="status">{state.message}</div>}
    </form>
  );
}
