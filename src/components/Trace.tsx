import type { TraceLine } from "@/lib/rules/types";

/** Click a number to see exactly how it was worked out. */
export default function Trace({ value, lines, label }: { value: string; lines: TraceLine[]; label: string }) {
  return (
    <details className="trace">
      <summary aria-label={`${label}: ${value}. Show how this was worked out`}>{value}</summary>
      <div className="trace-pop" role="note">
        <strong>How this was worked out</strong>
        <ol>
          {lines.map((l, i) => (
            <li key={i}><span className="small muted">{l.label}</span><br />{l.formula} <b>→ {l.value}</b></li>
          ))}
        </ol>
      </div>
    </details>
  );
}
