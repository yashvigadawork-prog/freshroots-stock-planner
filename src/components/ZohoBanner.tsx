import Link from "next/link";
import { getDb } from "@/db";
import { draftReminders, getSyncState } from "@/lib/services/zoho";
import { formatWhen } from "@/lib/time";
import { retrySyncAction } from "@/app/zoho/orders/actions";

export default async function ZohoBanner() {
  const db = await getDb();
  const [s, reminders] = await Promise.all([getSyncState(db), draftReminders(db)]);
  return (
    <>
      {!s.configured ? (
        <div className="alert neutral" role="status">
          <strong>Zoho: Not connected.</strong> On order shows &ldquo;Not connected&rdquo; and no draft purchase orders will be created. Everything else works. <Link href="/zoho/connection">Connect Zoho</Link>
        </div>
      ) : s.ok === false ? (
        <div className="alert warn" role="status">
          <strong>Zoho is slow or not answering.</strong> {s.error} You can keep working: approvals are saved, and drafts are created once Zoho is back.
          <form action={retrySyncAction} style={{ display: "inline", marginLeft: 8 }}><button className="btn ghost" type="submit">Try again</button></form>
        </div>
      ) : s.ok ? (
        <div className="alert good" role="status">
          <strong>Zoho: connected.</strong> Last read {s.at ? formatWhen(new Date(s.at)) : ""}: {s.orders} open order{s.orders === 1 ? "" : "s"}. <Link href="/zoho/orders">Zoho orders</Link>
        </div>
      ) : (
        <div className="alert neutral" role="status">
          <strong>Zoho is set up.</strong> Open orders have not been read yet. <Link href="/zoho/orders">Zoho orders</Link>
        </div>
      )}
      {reminders.length > 0 && (
        <div className="alert warn" role="status">
          <strong>Reminder:</strong> {reminders.length} approved item{reminders.length === 1 ? " has" : "s have"} no order in Zoho after 3 days ({[...new Set(reminders.map((r) => r.skuId))].slice(0, 6).join(", ")}). <Link href="/zoho/orders">See Zoho orders</Link>
        </div>
      )}
    </>
  );
}
