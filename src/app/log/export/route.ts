import { getDb } from "@/db";
import { listDecisions } from "@/lib/services/log";

export const dynamic = "force-dynamic";

const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const rows = await listDecisions(await getDb(), {
    skuId: u.searchParams.get("sku") || undefined,
    action: u.searchParams.get("action") || undefined,
  });
  const head = ["When (UTC)", "Review", "SKU", "Decision", "Rule quantity", "Final quantity", "By", "Acted as backup", "Reason", "Rules version"];
  const lines = rows.map((r) =>
    [r.at.toISOString(), r.cycleId, r.skuId, r.action, r.ruleQty, r.finalQty, r.who, r.asBackup ? "yes" : "no", r.reason, r.ruleVersion].map(q).join(","),
  );
  return new Response([head.map(q).join(","), ...lines].join("\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="decision-log.csv"' },
  });
}
