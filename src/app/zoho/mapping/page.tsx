import { getDb } from "@/db";
import { getActor } from "@/lib/actor";
import { loadWorkspace } from "@/lib/services/workspace";
import { loadMappings } from "@/lib/services/zoho";
import MappingForm from "./MappingForm";

export const dynamic = "force-dynamic";

export default async function MappingPage() {
  const db = await getDb();
  const { actor } = await getActor(db);
  const [ws, maps] = await Promise.all([loadWorkspace(db), loadMappings(db)]);
  const skus = (ws?.rows ?? []).map((r) => ({ id: r.sku.skuId, label: r.sku.name.replace("Freshroots ", ""), sub: r.sku.skuId, value: maps.items[r.sku.skuId] ?? "" }));
  const seen = new Set<string>();
  const suppliers = (ws?.snapshot.dataset.distributors ?? []).filter((d) => !seen.has(d.distributorId) && seen.add(d.distributorId)).map((d) => ({
    id: d.distributorId, label: d.name, sub: `${d.distributorId} · ${d.region}${d.active ? "" : " · INACTIVE"}`, value: maps.vendors[d.distributorId] ?? "",
  }));
  const unmapped = skus.filter((s) => !s.value).length + suppliers.filter((s) => !s.value).length;

  return (
    <main className="page">
      <h1>Zoho mapping</h1>
      <p className="muted">Tell the app which Zoho item each SKU is, and which Zoho vendor each supplier is. An approved SKU with no mapping is still saved as approved, but no draft is created and it is flagged.</p>
      <div className="card">
        <h2>Where do I find these numbers?</h2>
        <ol>
          <li>Open Zoho Inventory and go to <strong>Items</strong>. Click the item.</li>
          <li>Look at the address bar. The long number at the end (about 18 digits) is the <strong>item ID</strong>.</li>
          <li>For suppliers: <strong>Purchases → Vendors</strong>, click the vendor, and copy the long number from the address bar the same way.</li>
        </ol>
        <p className="small muted">This app is only allowed to read and create purchase orders, so it cannot look these up for you. {unmapped > 0 ? `${unmapped} not mapped yet.` : "Everything is mapped."}</p>
      </div>
      <MappingForm skus={skus} suppliers={suppliers} canEdit={actor.role !== "backup"} />
    </main>
  );
}
