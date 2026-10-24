"use client";

import { useActionState } from "react";
import { uploadAction, type UploadState } from "./actions";

const FIELDS = [
  ["weekly_sales", "weekly_sales.csv", "Every week"],
  ["current_inventory", "current_inventory.csv", "Every week"],
  ["sku_master", "sku_master.csv", "Only when SKUs change"],
  ["distributor_master", "distributor_master.csv", "Only when suppliers change"],
  ["calendar", "calendar.csv", "Once a year"],
] as const;

export default function UploadForm() {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadAction, null);
  return (
    <form action={action}>
      {FIELDS.map(([name, label, hint]) => (
        <div className="drop" key={name}>
          <label htmlFor={name}>{label} <span className="muted small">({hint})</span></label>
          <input id={name} name={name} type="file" accept=".csv,text/csv" />
        </div>
      ))}
      <button className="btn" type="submit" disabled={pending}>{pending ? "Checking…" : "Check and save"}</button>

      {state && !state.ok && (
        <div className="alert error" role="alert">
          <strong>Nothing was saved. Please fix {state.errors.length === 1 ? "this" : "these"} and upload again:</strong>
          <ul>{state.errors.map((e, i) => <li key={i}>{e.message}</li>)}</ul>
        </div>
      )}
      {state?.ok && <div className="alert good" role="status">{state.message}</div>}
      {state && state.warnings.length > 0 && (
        <div className="alert warn">
          <strong>Worth a look:</strong>
          <ul>{state.warnings.map((w, i) => <li key={i}>{w.message}</li>)}</ul>
        </div>
      )}
    </form>
  );
}
