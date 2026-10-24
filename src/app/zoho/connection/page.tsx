import Link from "next/link";
import { configStatus } from "@/lib/zoho/config";
import { getDb } from "@/db";
import { getSyncState } from "@/lib/services/zoho";
import ZohoBanner from "@/components/ZohoBanner";
import TestButton from "./TestButton";

export const dynamic = "force-dynamic";

const WHAT: Record<string, string> = {
  ZOHO_CLIENT_ID: "Client ID from the Zoho API console",
  ZOHO_CLIENT_SECRET: "Client secret from the Zoho API console",
  ZOHO_REFRESH_TOKEN: "Refresh token made in step 4",
  ZOHO_ORGANIZATION_ID: "Your Zoho Inventory organisation ID (step 5)",
};

export default async function ConnectionPage() {
  const status = configStatus();
  const state = await getSyncState(await getDb());
  const dc = (process.env.ZOHO_DC || "in").toLowerCase();

  return (
    <main className="page">
      <h1>Zoho connection</h1>
      <p className="muted">Until this is done the app works fully, with &ldquo;Not connected&rdquo; shown for On order and no draft orders made. The secrets live in Vercel settings only: they are never shown here, logged, or sent to your browser.</p>
      <ZohoBanner />

      <section className="card">
        <h2>Status of the settings</h2>
        <ul className="envlist">
          {status.map((s) => (
            <li key={s.name}>
              <span className={`badge ${s.set ? "ok" : "stockout"}`}>{s.set ? "Set" : "Missing"}</span>
              <code>{s.name}</code> <span className="small muted">{WHAT[s.name]}</span>
            </li>
          ))}
          <li><span className="badge ok">{dc === "in" && !process.env.ZOHO_DC ? "Default" : "Set"}</span><code>ZOHO_DC</code> <span className="small muted">Data centre: <strong>{dc}</strong> (India is <code>in</code>)</span></li>
        </ul>
        <p className="small muted">Only whether each one is set is shown, never its value.</p>
        <TestButton />
        {state.at && <p className="small muted">Last read of open orders: {new Date(state.at).toLocaleString("en-IN")} {state.ok ? "(worked)" : "(failed)"}</p>}
      </section>

      <section className="card">
        <h2>Step by step</h2>
        <ol className="steps">
          <li>
            <strong>Open the Zoho API console for India.</strong> Go to <code>api-console.zoho.in</code> and sign in with the Zoho account that owns your Inventory. (The <code>.in</code> is because Freshroots is on the India data centre. If your Zoho address ends in <code>.com</code>, use <code>api-console.zoho.com</code> and set <code>ZOHO_DC</code> to <code>com</code>.)
          </li>
          <li>
            <strong>Create a Self Client.</strong> Click <em>Add Client</em>, choose <em>Self Client</em>, and click <em>Create</em>. Zoho now shows a <strong>Client ID</strong> and a <strong>Client Secret</strong>. Keep this page open. Do not paste them into chat or email.
          </li>
          <li>
            <strong>Make a one-time code.</strong> Open the <em>Generate Code</em> tab. In <em>Scope</em> type exactly this, with no spaces: <code>ZohoInventory.purchaseorders.READ,ZohoInventory.purchaseorders.CREATE</code>. Set the time to 10 minutes, write &ldquo;Freshroots stock planner&rdquo; as the description, choose your Inventory organisation if asked, and click <em>Create</em>. Copy the code. It only works for 10 minutes. These two scopes are the only access the app gets: it can read purchase orders and create new draft ones, and nothing else.
          </li>
          <li>
            <strong>Turn the code into a refresh token.</strong> On your Mac, open Terminal in this project&apos;s folder and run <code>npm run zoho:token</code>. It asks for your data centre (press Enter for <code>in</code>), the client ID, the client secret, and the code. It then prints a long <strong>refresh token</strong>. Copy it. It never expires unless you delete the client in Zoho.
          </li>
          <li>
            <strong>Find your organisation ID.</strong> In Zoho Inventory click the gear icon, then <em>Settings → Organization Profile</em>. The <strong>Organization ID</strong> is shown there.
          </li>
          <li>
            <strong>Put the four values into Vercel.</strong> Open your project on vercel.com, then <em>Settings → Environment Variables</em>. Add these four, tick <em>Sensitive</em> for the first three, and apply to Production: <code>ZOHO_CLIENT_ID</code>, <code>ZOHO_CLIENT_SECRET</code>, <code>ZOHO_REFRESH_TOKEN</code>, <code>ZOHO_ORGANIZATION_ID</code>. Add <code>ZOHO_DC</code> only if you are not on India. Then <em>Deployments → … → Redeploy</em> so the app picks them up. (To try it on your own computer instead, put the same names and values in a file called <code>.env.local</code> in the project folder.)
          </li>
          <li>
            <strong>Click Test connection above.</strong> A green tick means it works. A red message says what to check.
          </li>
          <li>
            <strong>Map your items and suppliers.</strong> Draft orders need to know which Zoho item and vendor to use: <Link href="/zoho/mapping">open the mapping screen</Link>.
          </li>
        </ol>
      </section>
    </main>
  );
}
