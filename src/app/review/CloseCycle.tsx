"use client";

import { useState, useTransition } from "react";
import { closeCycleAction } from "./actions";

export default function CloseCycle({ cycleId, remaining, spotRemaining }: { cycleId: number; remaining: number; spotRemaining: number }) {
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const blocked = remaining > 0;
  return (
    <div className="card close">
      <h2>Close this review</h2>
      <p className="muted">
        {blocked
          ? `${remaining} item${remaining > 1 ? "s" : ""} still need an answer${spotRemaining ? `, including ${spotRemaining} spot-check${spotRemaining > 1 ? "s" : ""}` : ""}. The review can be closed once everything is answered.`
          : "Everything is answered. Closing saves this week's decisions to the log."}
      </p>
      <button className="btn" disabled={blocked || pending} onClick={() => start(async () => {
        const r = await closeCycleAction(cycleId);
        if (!r.ok) setError(r.error);
        else setNote(r.note ?? null);
      })}>Close review</button>
      {error && <div className="alert error" role="alert">{error}</div>}
      {note && <div className="alert good" role="status">{note}</div>}
    </div>
  );
}
