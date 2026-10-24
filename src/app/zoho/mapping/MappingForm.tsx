"use client";

import { useActionState } from "react";
import { saveMappingsAction, type MapState } from "./actions";

type Row = { id: string; label: string; sub: string; value: string };

export default function MappingForm({ skus, suppliers, canEdit }: { skus: Row[]; suppliers: Row[]; canEdit: boolean }) {
  const [state, action, pending] = useActionState<MapState, FormData>(saveMappingsAction, null);
  const field = (prefix: string, r: Row) => (
    <tr key={r.id}>
      <td><strong>{r.label}</strong><br /><span className="small muted">{r.sub}</span></td>
      <td>
        <input name={`${prefix}:${r.id}`} defaultValue={r.value} inputMode="numeric" placeholder="e.g. 3012345000000123456" disabled={!canEdit} aria-label={`Zoho ID for ${r.label}`} className="idbox" />
        {!r.value && <div className="small" style={{ color: "var(--terracotta)" }}>Not mapped: no draft will be created</div>}
      </td>
    </tr>
  );
  return (
    <form action={action}>
      <section className="card">
        <h2>Suppliers → Zoho vendors</h2>
        <div className="table-wrap"><table><thead><tr><th>Supplier</th><th>Zoho vendor ID</th></tr></thead><tbody>{suppliers.map((r) => field("vendor", r))}</tbody></table></div>
      </section>
      <section className="card">
        <h2>SKUs → Zoho items</h2>
        <div className="table-wrap"><table><thead><tr><th>SKU</th><th>Zoho item ID</th></tr></thead><tbody>{skus.map((r) => field("item", r))}</tbody></table></div>
      </section>
      <div className="actions"><button className="btn" type="submit" disabled={pending || !canEdit}>{pending ? "Saving…" : "Save mapping"}</button></div>
      {!canEdit && <div className="alert neutral">The backup approver can read the mapping. Raghav or an Admin changes it.</div>}
      {state && <div className={`alert ${state.ok ? "good" : "error"}`} role={state.ok ? "status" : "alert"}>{state.text}</div>}
    </form>
  );
}
