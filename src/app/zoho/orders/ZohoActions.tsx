"use client";

import { useActionState } from "react";
import { createDraftsAction, refreshAction, type Msg } from "./actions";

export default function ZohoActions({ cycleId, canCreate }: { cycleId: number | null; canCreate: boolean }) {
  const [r, refresh, rp] = useActionState<Msg>(async () => refreshAction(), null);
  const [c, create, cp] = useActionState<Msg>(async () => (cycleId ? createDraftsAction(cycleId) : null), null);
  return (
    <div>
      <div className="actions">
        <form action={refresh}><button className="btn secondary" type="submit" disabled={rp}>{rp ? "Reading Zoho…" : "Read open orders from Zoho"}</button></form>
        <form action={create}><button className="btn" type="submit" disabled={cp || !canCreate}>{cp ? "Creating…" : "Create or retry draft orders"}</button></form>
      </div>
      {!canCreate && <p className="small muted">Draft orders can be created once the review is closed.</p>}
      {r && <div className={`alert ${r.ok ? "good" : "warn"}`} role="status">{r.text}</div>}
      {c && <div className={`alert ${c.ok ? "good" : "warn"}`} role="status">{c.text}</div>}
    </div>
  );
}
