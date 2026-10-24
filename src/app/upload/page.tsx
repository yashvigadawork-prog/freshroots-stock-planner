import { getDb } from "@/db";
import { latestSnapshot } from "@/lib/services/snapshots";
import { openCycleOrNull } from "@/lib/services/cycle";
import UploadForm from "./UploadForm";
import { startReviewAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const db = await getDb();
  const snap = await latestSnapshot(db);
  const open = await openCycleOrNull(db);
  return (
    <main className="page">
      <h1>Upload data</h1>
      <p className="muted">Export these from SAP and upload them here. Each week you only need the first two. Every upload is kept as a dated snapshot.</p>
      <div className="card">
        <UploadForm />
      </div>
      {snap && (
        <div className="card">
          <h2>Latest saved upload</h2>
          <p>
            Stock date <strong>{snap.asOfDate}</strong> · uploaded {snap.uploadedAt.toLocaleString("en-IN")} · files: {snap.filesUploaded.join(", ")}
          </p>
          {open ? (
            <p className="muted">A review is already open. Finish it before starting another.</p>
          ) : (
            <form action={startReviewAction}>
              <button className="btn secondary" type="submit">Start this week&apos;s review</button>
            </form>
          )}
        </div>
      )}
    </main>
  );
}
