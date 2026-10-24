import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import { activeTriggers } from "@/lib/services/kill";
import { acknowledgeAction } from "@/app/kill-actions";

/** Red banner on every page while a safeguard has fired. Draft creation stays paused until an Admin acknowledges it. */
export default async function KillBanner() {
  const db = await getDb();
  const [triggers, { actor }] = await Promise.all([activeTriggers(db), getActor(db)]);
  if (!triggers.length) return null;
  return (
    <div className="killbar" role="alert">
      <div className="killbar-inner">
        <strong>Safeguard triggered. Draft orders in Zoho are paused.</strong>
        {triggers.map((t) => (
          <div className="kill-item" key={t.id}>
            <span>{t.detail}</span>
            {actor.role === "admin" ? (
              <form action={acknowledgeAction.bind(null, t.id)}>
                <button className="btn light" type="submit">I have looked at this: resume</button>
              </form>
            ) : (
              <span className="small">Ask an Admin to review and acknowledge this.</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
