// A practice Zoho for trying the app without a real account. Run: npm run fake-zoho
// Then start the app with:
//   ZOHO_CLIENT_ID=x ZOHO_CLIENT_SECRET=y ZOHO_REFRESH_TOKEN=good ZOHO_ORGANIZATION_ID=60001 \
//   ZOHO_ACCOUNTS_BASE=http://localhost:4010 ZOHO_API_BASE=http://localhost:4010/inventory/v1 npm run dev
import { createServer } from "node:http";

const pos = [
  { purchaseorder_id: "9001", purchaseorder_number: "PO-9001", vendor_id: "7000000000001", vendor_name: "NutriFlow Distributors", status: "open", date: "2026-10-15", delivery_date: "2026-10-27", line_items: [{ item_id: "8100000000001", quantity: 400, quantity_received: 100 }] },
  { purchaseorder_id: "9002", purchaseorder_number: "PO-9002", vendor_id: "7000000000002", vendor_name: "GrainPath Logistics", status: "open", date: "2026-09-20", delivery_date: "2026-10-01", line_items: [{ item_id: "8100000000003", quantity: 300, quantity_received: 0 }] },
];
let nextId = 9100;
const send = (res, code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  let raw = "";
  for await (const c of req) raw += c;
  console.log(req.method, url.pathname);
  if (url.pathname === "/oauth/v2/token") {
    const f = new URLSearchParams(raw);
    return send(res, 200, f.get("refresh_token") === "good" ? { access_token: "practice-token", expires_in: 3600 } : { error: "invalid_code" });
  }
  if (req.headers.authorization !== "Zoho-oauthtoken practice-token") return send(res, 401, { code: 57, message: "You are not authorized" });
  const path = url.pathname.replace("/inventory/v1", "");
  if (req.method === "GET" && path === "/purchaseorders") {
    let list = pos;
    const ref = url.searchParams.get("reference_number");
    if (ref) list = list.filter((p) => p.reference_number === ref);
    else if (url.searchParams.get("status")) list = list.filter((p) => p.status === url.searchParams.get("status"));
    return send(res, 200, { code: 0, message: "success", purchaseorders: list.map(({ line_items, ...p }) => p), page_context: { has_more_page: false } });
  }
  const one = /^\/purchaseorders\/(\d+)$/.exec(path);
  if (req.method === "GET" && one) {
    const po = pos.find((p) => p.purchaseorder_id === one[1]);
    return po ? send(res, 200, { code: 0, purchaseorder: po }) : send(res, 404, { code: 1002, message: "Not found" });
  }
  if (req.method === "POST" && path === "/purchaseorders") {
    const b = JSON.parse(raw);
    const id = String(nextId++);
    const po = { purchaseorder_id: id, purchaseorder_number: `PO-${id}`, vendor_id: b.vendor_id, vendor_name: "Vendor", status: "draft", date: b.date, reference_number: b.reference_number, line_items: b.line_items };
    pos.push(po);
    console.log("  created DRAFT", po.purchaseorder_number, JSON.stringify(b.line_items));
    return send(res, 201, { code: 0, message: "The purchase order has been created.", purchaseorder: po });
  }
  send(res, 404, { code: 5, message: "Invalid URL" });
}).listen(4010, () => console.log("Practice Zoho listening on http://localhost:4010"));
