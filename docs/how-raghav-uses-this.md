# How Raghav uses the Freshroots Stock Planner each week

**Live app:** https://freshroots-stock-planner-henna.vercel.app
**Time needed:** about 20 minutes. Do it on a Monday, with that morning's stock.

The app does the arithmetic from the Excel rules. **You decide.** Nothing goes to Zoho until you approve it, and then only as a *draft* order that you still issue yourself in Zoho.

## 1. Get two files from SAP
- `weekly_sales.csv`: last 16 weeks (columns `SKU_ID, Week, Units_Sold`, weeks like `2026-W42`).
- `current_inventory.csv`: today's stock (columns `SKU_ID, Location, Units_On_Hand, As_Of_Date`).

Only re-upload `sku_master.csv`, `distributor_master.csv` and `calendar.csv` when SKUs, suppliers or the festival calendar change.

## 2. Upload
**Upload data** → choose the files → **Check and save**. If something is wrong the app says so in plain words (for example "SKU004 has 2026-W41 twice, row 3") and saves nothing. Fix the file and try again.

## 3. Start the review
On the same page, click **Start this week's review**. If Zoho is connected, the app first reads your open purchase orders so they count as stock on the way.

## 4. Look at Home
Five tiles show Stockout risk, Overstock risk, High demand, Needs judgment and SKUs tracked. **Click any number** to see exactly how it was worked out. Read the banners: they tell you if the stock file is getting old, or if Zoho is not answering.

## 5. Answer every card on the Review list
| Button | What it means |
|---|---|
| **Approve** | Take the rule's number. (On an overstock card: "Approve pause", skip the next order.) |
| **Change** | Pick your own quantity with **+** and **−**. A reason is required. |
| **Reject** | You think the rule is wrong. A reason is required. |

- **Amber warning** = even after the order, cover is still too low or too high. You can still approve.
- **Needs judgment** = too little history or very uneven sales. No number is suggested. Use *Set a quantity* or *No order*.
- **Spot-checks**: two SKUs the rules called fine. Press *Looks right* or *Not right*.

## 6. Close the review
**Close review** switches on only when every card and both spot-checks are answered. Closing saves the decisions and, if Zoho is connected, creates **one draft purchase order per supplier**. Then open **Zoho orders** to see which items are drafted and which are **flagged** (missing Zoho mapping, or an inactive supplier). Flagged items are still approved: add them in Zoho by hand.

## 7. In Zoho
Open the drafts, check them, and issue them yourself. The app never issues, edits or deletes anything in Zoho.

## Good habits and warnings
- Finish the review within **2 days** (it is highlighted after that).
- Stock file **4 days old**: yellow warning. **7 days old**: draft orders are blocked until you upload a new file.
- An approved item with no Zoho order after **3 days**: a reminder appears on Home.
- If you are away, pick **Backup approver** in the *Working as* box at the top. Everything they do is logged under their name.
- A **red banner** means a safeguard fired (for example you rejected 3 of the first 10 stockout recommendations). Draft orders pause until an **Admin** reads it and clicks *Resume*.

## Each quarter
Open **Results** and type in the quarter's stockout and overstock losses in lakh. The page compares them with the ₹28 to 34 lakh baseline and the 25% goal.

## Where things are
**Decision log** shows every approve, change and reject (with a CSV download). **Rules** shows the thresholds; only an Admin can change them, and each change makes a new version. **SKU pages** (click any SKU name) show the 16-week chart and past decisions.
