// Turns the one-time code from the Zoho API console into a refresh token. Run: npm run zoho:token
// Everything is typed into YOUR terminal and sent only to Zoho. Nothing is saved to disk.
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const rl = createInterface({ input: stdin, output: stdout });
const dc = ((await rl.question("Data centre (press Enter for India = in): ")).trim() || "in").toLowerCase();
const clientId = (await rl.question("Client ID: ")).trim();
const clientSecret = (await rl.question("Client secret: ")).trim();
const code = (await rl.question("One-time code (valid 10 minutes): ")).trim();
rl.close();

const res = await fetch(`https://accounts.zoho.${dc}/oauth/v2/token`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, client_secret: clientSecret, code }),
});
const body = await res.json().catch(() => ({}));
if (body.refresh_token) {
  console.log("\nYour refresh token (copy it into Vercel as ZOHO_REFRESH_TOKEN, and keep it private):\n");
  console.log(body.refresh_token);
} else {
  console.log(`\nZoho did not give a refresh token (${body.error ?? res.status}).`);
  console.log("Usual causes: the code is older than 10 minutes, was already used, or the data centre is wrong. Make a new code and try again.");
  process.exit(1);
}
