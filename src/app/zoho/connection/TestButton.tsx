"use client";

import { useActionState } from "react";
import { testConnectionAction, type TestState } from "./actions";

export default function TestButton() {
  const [s, run, pending] = useActionState<TestState>(async () => testConnectionAction(), null);
  return (
    <form action={run}>
      <button className="btn" type="submit" disabled={pending}>{pending ? "Testing…" : "Test connection"}</button>
      {s && (
        <div className={`alert ${s.ok ? "good" : "error"}`} role={s.ok ? "status" : "alert"}>
          <span className="tick" aria-hidden="true">{s.ok ? "✓" : "✕"}</span> {s.text}
        </div>
      )}
    </form>
  );
}
