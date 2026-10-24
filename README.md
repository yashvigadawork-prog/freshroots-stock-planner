# Freshroots Stock Planner

Weekly reorder and pause recommendations for Freshroots, reviewed and approved by the demand planner.
Every number comes from plain rules (no machine learning) and can be traced to its inputs.

## Run it on your computer

```bash
npm install
npm run dev
```

Open http://localhost:3100. The first run loads the sample data (stock date 19 Oct 2026) by itself, using a small database built into the app, so no accounts are needed.

```bash
npm test      # rules, upload checks, decisions, settings, results
npm run build # production build
```

## What is in the folder

- `src/lib/rules` the rules engine (pure arithmetic) and its settings
- `src/lib/data` CSV checks and turning an upload into rule inputs
- `src/lib/services` database actions (cycles, decisions, rules versions, results)
- `src/app` the screens
- `data/sample` the five sample CSVs
- `design` brand kit, Rooty the mascot and the snack icons

There is no sign-in. A "Working as" picker in the header chooses Raghav (Planner), Backup approver or Admin so every action is logged with a name.

## Zoho

The app only ever reads purchase orders and creates new **draft** ones (scopes `ZohoInventory.purchaseorders.READ` and `.CREATE`). Anything else is blocked in `src/lib/zoho/client.ts`. Setup steps are on the **Zoho connection** screen. `.env.example` lists the settings.

To try the whole Zoho flow without an account, run `npm run fake-zoho` and follow the comment at the top of `scripts/fake-zoho.mjs`.

## Guides

- `docs/how-raghav-uses-this.md` the one-page weekly routine
- `docs/final-checklist.md` what is done and what is still to do
