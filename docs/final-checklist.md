# Freshroots Stock Planner: your final checklist

**Live link:** https://freshroots-stock-planner-henna.vercel.app
**Project folder:** `~/Desktop/freshroots-stock-planner`
**Run it on your Mac:** open Terminal in the folder, run `npm install`, then `npm run dev`, then open http://localhost:3100 (uses a built-in database, never your live one).

## Done and checked
- [x] Rules engine, with every number from your brief (5 stockout, 2 overstock, 8 OK, none needing judgment). 94 automated tests pass.
- [x] All 9 screens plus the Brand kit, with approve / change / reject, spot-checks and the close rule.
- [x] Decision log, rule versions, Results tracker, 3 kill-trigger safeguards with the red banner.
- [x] Zoho: connection screen, mapping, open orders, draft orders (tested against a practice Zoho only).
- [x] Neon database added from Vercel, and the live site deployed. The sample data loaded on first visit and saving works.

## Still for you to do
1. **Connect Zoho (about 30 minutes).** Open the live app, **Zoho connection**, and follow the 8 steps. You will: make a Self Client at `api-console.zoho.in`, create a code with the two purchase-order scopes, run `npm run zoho:token` in Terminal to get a refresh token, find your organisation ID, add four settings in **Vercel → your project → Settings → Environment Variables**, redeploy, and click **Test connection**.
2. **Map your items and suppliers** on the **Zoho mapping** screen (the app is not allowed to look them up). Until you do, approved items are saved but no draft is made, and they are flagged.
3. **Do the first real Zoho test with one small approval**, then check the draft in Zoho. I could only test against a practice Zoho, so the real one may need a small adjustment.
4. **Upload a fresh stock file before 26 Oct.** The sample stock date is 19 Oct. From 26 Oct (7 days old) draft creation is blocked until a newer file is uploaded.
5. **Decide who can open the live link.** There is no sign-in, as you asked, so anyone with the link can use the app. Do not share it widely or put real supplier or loss figures in it. If needed, Vercel can put a password in front of the whole site.
6. **Walk Raghav through `docs/how-raghav-uses-this.md`** and confirm the choices below with him.
7. **Keep your project safe.** The folder is not a git repository yet. Before submitting, zip the folder without `node_modules`, or ask me to put it on GitHub.
8. **At each quarter end,** enter the losses on the **Results** page. Your first full quarter is 2027-Q1.

## Choices I made that Raghav should confirm
- "Weekly sales swing more than 40%" means any averaged week is more than 40% from the 12-week average.
- Festival uplift (1.25×) applies to the stockout and overstock checks, not the high-demand check.
- A SKU "stocks out" (kill trigger 2) when its next stock file shows zero after the rules said OK.
- The "11 to 13 percent" fall (kill trigger 3) uses 11% as the line.
- "Stock held" is summed across locations; only Pune Central Warehouse exists today.

## Good to know
- **No emails or phone alerts.** Warnings and reminders appear in the app only.
- **"Working as" picker** replaces sign-in. It exists so the log can show who acted.
- **Database:** manage it in Vercel under **Storage**. Do not delete it: it holds the decision history.
- **Open orders** count only for Zoho items you have mapped.
