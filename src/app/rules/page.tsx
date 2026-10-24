import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getActor } from "@/lib/actor";
import { diffSettings } from "@/lib/rules/fields";
import { getCurrentRules, listVersions } from "@/lib/services/rules";
import { formatWhen } from "@/lib/time";
import RulesForm from "./RulesForm";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const db = await getDb();
  const { actor } = await getActor(db);
  const [current, versions, people] = await Promise.all([getCurrentRules(db), listVersions(db), db.select().from(users)]);
  const who = new Map(people.map((p) => [p.id, p.name]));

  return (
    <main className="page">
      <h1>Rules and settings</h1>
      <p className="muted">
        These are the plain rules behind every recommendation. You are looking at <strong>version {current.version}</strong>. A change creates a new version; past decisions keep the version they used.
      </p>
      <RulesForm settings={current.settings} canEdit={actor.role === "admin"} />

      <section className="card">
        <h2>Version history</h2>
        {versions.map((v, i) => {
          const prev = versions[i + 1];
          const changes = prev ? diffSettings(prev.settings, v.settings) : [];
          return (
            <div className="version" key={v.id}>
              <strong>Version {v.version}</strong> {i === 0 && <span className="badge current">Current</span>}
              <div className="small muted">{formatWhen(v.createdAt)} · {v.changedBy ? who.get(v.changedBy) ?? "Unknown" : "Set up"}</div>
              <div>{v.changeNote}</div>
              {changes.length > 0 && (
                <ul>{changes.map((c) => <li key={c.key}>{c.label}: {c.from} → {c.to}</li>)}</ul>
              )}
            </div>
          );
        })}
      </section>
    </main>
  );
}
