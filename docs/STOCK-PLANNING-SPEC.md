# Stock & production planning — specification v1

Written by Claude (owner of the website project) on 2026-10-28 for Codex (owner of this dashboard).
Requested by Aitor (Orkesta). Business owner: Valentina (Edelweiss Pastry Shop).
This file is the contract between the two projects. Read it fully before building. Do not
change the API contract (section 4) without updating the changelog at the end and telling Aitor.

Background research (methods, sources, benchmarks): `informes/2026-10-28-investigacion-planificacion-produccion.md`
in the website workspace. Aitor can share it. Section 6 of that report is the method used below.

---

## 1. Goal

Replace the current "Weekly production forecast" card (online orders only, last 4 weeks avg × 1.15)
with a professional production planner for the whole bakery:

- How much of each product to bake tomorrow and this week, for counter + online + pre-orders.
- Editable parameters so Valentina and staff can tune it without a developer.
- Comparisons: week vs previous week, month vs previous month, same date last year.
- Waste, sell-out and accuracy tracking, so the plan gets better each week.

Non-goals for v1: AI/ML models, weather, recipes/ingredients purchasing, payments.

## 2. Ownership and collaboration rules

| Area | Owner | Notes |
|---|---|---|
| Dashboard UI, database, planning logic, tests | **Codex** (this repo) | |
| Clover access (tokens), website, Clover data feed endpoints | **Claude** (website repo `EDELWEISS-LANDING-PAGE-2026`) | Clover credentials stay in the website project. This repo never gets a Clover token. |
| Shared secret `DASHBOARD_FEED_SECRET` | **Aitor** | Same value in both Vercel projects. |
| Business parameters, event calendar, prices and costs | **Valentina** (via the Settings screen) | |
| One-time 12-month history export from Clover | **Aitor / Valentina** | See section 5.3. |

- Neither agent edits the other's repository.
- Questions or contract changes go through Aitor, and get recorded in the changelog below.

## 3. Data sources

1. **Clover daily sales per item:** counter + online. Comes through the feed in section 4. The Clover
   order API only returns the last 90 days, so the dashboard must **store a daily snapshot** from day one.
2. **Online orders and pre-orders:** already arrive here via n8n → Google Sheets / ingest. Pre-orders for a
   future pickup date (Thanksgiving, Christmas) are **added on top** of the forecast. They are never forecast.
3. **Staff daily close:** a new screen in this dashboard (section 7.3).
4. **Events calendar:** a new table, edited by staff.
5. **History:** a one-time import of a Clover CSV export (section 5.3).

## 4. API contract (served by the website, consumed by the dashboard)

Base URL: `https://www.edelweisspastryshop.ch`

### 4.1 Authentication (all endpoints)

Header: `x-edelweiss-signature: t=<unix seconds>,v1=<hex hmac>`

- `v1 = HMAC_SHA256(DASHBOARD_FEED_SECRET, t + "." + METHOD + " " + PATH_WITH_QUERY + "." + RAW_BODY)`
  (`RAW_BODY` is an empty string for GET).
- The server rejects a request if the clock difference is more than 300 s or the signature does not match. Both cases return 401.

### 4.2 `GET /api/internal/sales-daily?date=YYYY-MM-DD`

The date is a Maine local date. Only dates within the last 90 days are available (a Clover limit).

```json
{
  "date": "2026-10-27",
  "timezone": "America/New_York",
  "generatedAt": "2026-10-28T06:30:12Z",
  "complete": true,
  "items": [
    {
      "cloverItemId": "DB0KKYYDSFKYP",
      "name": "Berliner",
      "unitsInStore": 9,
      "unitsOnline": 2,
      "unitsTotal": 11,
      "revenueCents": 4400,
      "firstSaleAt": "07:12",
      "lastSaleAt": "11:48",
      "hourly": { "7": 1, "8": 3, "9": 4, "10": 2, "11": 1 },
      "stockEnd": 0
    }
  ]
}
```

Rules:
- Only paid orders count. Refunds are subtracted.
- An order is online if any of its line items has a note starting with `ONLINE`.
- `unitQty` is already divided by 1000.
- `stockEnd` is the Clover stock count when the snapshot is taken. It is `null` when the item is not tracked.
- Custom line items with no Clover item (delivery fee, driver tip) are excluded.
- `complete: false` means the day is still running.

### 4.3 `GET /api/internal/items`

Returns the Clover catalogue for mapping products:

```json
{ "items": [ { "cloverItemId": "...", "name": "...", "priceCents": 400, "category": "...", "tracked": true, "stock": 12 } ] }
```

### 4.4 Phase 2, needs Aitor's approval: `POST /api/internal/stock`

Body: `{ "cloverItemId": "...", "setTo": 24, "reason": "bake-entry" }`

Sets the Clover stock to the baked quantity, so the website shows the real count without anyone typing it into Clover.

### 4.5 Schedule

- **02:30 ET:** the dashboard pulls yesterday's snapshot.
- **Same run:** it backfills any missing day from the last 90.
- **Every 15 minutes, 07:00–14:00:** it may pull `date=today` for live sell-out detection.

## 5. Data model (Postgres, this repo)

### 5.1 Tables

```
plan_products(
  product_key text pk, clover_item_id text, display_name text,
  family text,               -- laminated | bread | pastry | cookie | cake | savory | seasonal
  active bool, seasonal_from date null, seasonal_to date null,
  units_per_tray int default 1, pieces_per_dough_batch int null, lead_days int default 0,
  target_sellout_time time default '12:00', buffer_k numeric default 1.0,
  max_waste_pct numeric default 15, price_cents int, unit_cost_cents int null,
  par_mon int, par_tue int, par_wed int, par_thu int, par_fri int, par_sat int, par_sun int  -- manual par
)
daily_sales(date, product_key, units_in_store, units_online, revenue_cents,
            first_sale_at time, last_sale_at time, hourly jsonb, stock_end int null, pk(date, product_key))
daily_close(date, product_key, baked int, leftover int, tgtg int, reused int, discarded int,
            sold_out bool, sold_out_at time null, entered_by text, entered_at timestamptz, pk(date, product_key))
plan_events(id, date_from, date_to, name, factor numeric, scope text, -- all | family | product
            scope_value text null, closed bool default false, note text)
plan_days(date, product_key, suggested int, planned int, override_reason text null,
          explain jsonb, created_by text, pk(date, product_key))   -- explain = base, factors, buffer, pre-orders
plan_settings(key text pk, value jsonb)
freezer_moves(id, date, family, pieces int, kind text)   -- phase 2: in | out | count
```

### 5.2 Initial par

`docs/stock-par-seed.csv` holds Valentina's weekly projection Excel, mapped to the website product names.
Rows marked "confirm with Valentina" are guesses. Map names to `clover_item_id` with `/api/internal/items`.

### 5.3 History import

Valentina or Aitor exports from the Clover dashboard (Reporting → Sales → Items, by day). It may need
several date ranges to cover the last 12 months. The importer accepts a CSV with columns
date, item name, quantity, gross sales, and maps names with `plan_products`. History has no hourly
data, so sell-out correction only applies from the first live snapshot onwards.

## 6. Planning method (per product, per day D)

1. **Corrected demand for each past day.**
   - If the product did not sell out, demand = units sold.
   - If it sold out at time t, demand = units ÷ share(t), where share(t) is the product's usual cumulative
     share of daily sales by time t, learned from the days it did not sell out.
   - Cap the correction at `censor_cap` (default 1.6×).
   - A day counts as sold out if the close entry says so, or if `stock_end = 0` and the last sale was more
     than 30 minutes before closing.
2. **Base** = mean corrected demand of the last `base_weeks` (default 4) same weekdays. Skip days inside an
   event or closure. With fewer than 3 valid days, use the manual par.
3. **Season factor** (once 12 months of history exist) = last year's sales in the target week (D − 364)
   ÷ last year's mean over the same weeks as the base. Clamp between `season_min` and `season_max`
   (defaults 0.75 and 1.35).
4. **Event factor** from `plan_events` (for example ×1.3 the day before a holiday, ×0.6 for a snowstorm,
   0 on closed days).
5. **Buffer** = `buffer_k` × standard deviation of corrected demand over the last 8 same weekdays.
6. **Suggested** = round up to `units_per_tray`( base × season × event + buffer ).
7. **Pre-orders** for pickup on D are shown in a separate column and added: planned = suggested + pre-orders.
8. **Weekly safety rules.** Each one shows a badge and moves the suggestion by one tray:
   - if the product sold out before `target_sellout_time` in ≥2 of the last 4 same weekdays, step **up**;
   - if discarded ÷ baked > `max_waste_pct` in ≥2 of the last 4 same weekdays, step **down**.
9. **Explain everything.** Store the base, factors, buffer and rules in `plan_days.explain`, and show them in a tooltip.
10. **Overrides.** Staff can change `planned`. A reason is required when the change exceeds ±20 %. Keep both values.

Phase 2, laminated dough (lead time 3 days): show a "Dough plan D+3" view per family.

- batches = ceil( (Σ planned pieces for the days covered + freezer par − frozen formed pieces − dough in
  process) ÷ `pieces_per_dough_batch` ).
- Freezer par per family is editable, defaulting to 1.5 × the average daily laminated bake.

## 7. Screens

1. **Tomorrow.** Rows are products, grouped by family. Columns: manual par | suggested | pre-orders | planned
   (editable) | why (tooltip). It has a print button with a large font for the kitchen.
2. **Week.** A Mon–Sun grid like Valentina's Excel, editable, with totals per day and per family. It prints on one Letter page.
3. **Daily close.** Mobile-first, for the counter iPad or phone, in 1–2 minutes. Per product: baked
   (prefilled with planned), leftover, of which TGTG / reused / discarded. Sold-out is prefilled from Clover.
4. **Comparisons.** Pick a product, a family or the total.
   - Week vs previous week: same weekdays.
   - Month vs previous month: **mean per open day**, not totals.
   - Same date last year: −364 days.
   - Moving holidays (Thanksgiving, Easter, Mother's Day, Memorial Day, Labor Day) are aligned by the holiday,
     for example "Thanksgiving −2 days" against the same point last year.
   - Show a bar or line chart (recharts is already installed) and a table with the deltas.
5. **Weekly KPIs.** Per product:
   - sell-through %;
   - waste %, with TGTG and reused shown separately from discarded;
   - number of sold-out days and the average sell-out time;
   - bias and WMAPE (suggested vs corrected demand);
   - a tracking signal shown as a traffic light, red when |TS| > 4.
6. **Settings.** Product parameters, the events calendar and global settings. Editable by the owner/staff role.
   Log changes with user and time.

Language: English UI, plain words. Staff are not technical.

## 8. Phases and acceptance

| Phase | Scope | Done when |
|---|---|---|
| 1 | Feed client and nightly snapshot, `plan_products` seeded from the CSV, Week screen with manual par, Daily close | A full week of snapshots is stored and staff complete the close in under 2 minutes |
| 2 | Method steps 1–7, Tomorrow screen, Settings, events | Suggested quantities are shown with explanations. Valentina checks 1 week against her judgement |
| 3 | Safety rules, KPIs, Comparisons, history import, season factor | Comparisons match Clover reports to within 1 unit/day on 5 sampled days |
| 4 | Dough plan and freezer, optional stock write to Clover (4.4) | Approved by Aitor and Valentina |

## 9. Open questions for Valentina (via Aitor)

- Units per tray and pieces per dough batch for each laminated product.
- Unit cost per product (optional; it lets the buffer reflect margin).
- Target sell-out time per product (default 12:00; bread may be later).
- Which leftovers are reused (for example croissants → almond croissants) and which go to Too Good To Go.
- Two names in the CSV need confirming: "Kuchen Struesel" and "Kuchen Tart".


---

## 4.6 Feed semantics — answers to the dashboard questions (2026-10-29)

Both read endpoints are **built and tested** in the website project (branch `release/2026-10-27`, commit after bf4316b),
against the real Clover merchant. They go live on `https://www.edelweisspastryshop.ch` as soon as Aitor approves the
deploy and sets `DASHBOARD_FEED_SECRET` in both Vercel projects.

| Question | Answer |
|---|---|
| Products without sales | **Every visible Clover item is returned**, with `unitsTotal: 0`, `hourly: {}`, `firstSaleAt: null`. A product missing from `items` is not in Clover at all. Hidden Clover items are omitted. Items that sold but no longer exist in the catalogue appear with `cloverItemId: null` and `stockEnd: null`. |
| Fractional quantities | `unitQty` is divided by 1000 and rounded to 2 decimals. Weighed items can be fractional (e.g. `0.5`). All unit fields and `hourly` values are numbers, never strings. |
| Refunds made later | The endpoint recomputes from Clover on every call. A refund flips `refunded` on the line item, so re-reading the day returns the corrected `unitsTotal` and the refunded quantity in `refundedUnits`. **Recommended:** on the nightly run, re-pull the last 7 days (not only yesterday) and upsert. |
| Dates without data | Inside the 90-day window a day with no paid orders returns `200`, `orders: 0`, `paidOrders: 0` and all items at zero. That is a real "zero sales" day (closed day, snowstorm). Dates older than the window return `422 {"error":"outside_clover_window","oldestAvailable":"YYYY-MM-DD"}`. Future dates return `400 {"error":"future_date"}`. |
| Meaning of `complete` | `true` when the Maine calendar day has ended at the time of the call; `false` for today. Only store a day as final when `complete` is `true`. A `complete: false` payload is a live partial (for sell-out pacing), safe to overwrite. |
| `stockEnd` with restocks | It is the Clover stock count **at the moment of the call**, not at closing. On the 02:30 pull for yesterday it equals the overnight count, before any morning restock. If staff restock before you pull, you see the restocked value; so also take the 14:10 `/items` snapshot (see `STOCK-PLANNING-IDEAS.md` §1) and treat that as the leftover count. `null` = item not stock-tracked. |
| Zero vs incomplete | `complete` answers "is the day over"; `paidOrders` answers "was there activity"; a `502 clover_error` answers "Clover failed, retry later". Never treat a 502 or a timeout as zero sales. |

Extra fields not in v1 (additive, safe to ignore): `orders` (all orders that day), `paidOrders`, `refundedUnits` per item,
`generatedAt`. `/items` also returns `hidden` and `available`.

Timing: `/sales-daily` takes 2–5 s per day (two Clover calls + catalogue). Pull sequentially, not in parallel, to stay
under Clover rate limits.

## Changelog

- 2026-11-11 dashboard v1.2 consumer: verified live split/pickups response; planning base uses in-store plus same-day online, pickup obligations union with Sheet by Clover order id, counter-only sell-out curves, durable private order provenance for refreshed/refunded captures, and pickup-aware historical backfill. Payment-date ledger, manual plans, daily closes, Thanksgiving mapping guard and Clover read-only boundary preserved. See `docs/STOCK-FEED-V1.2-IMPLEMENTATION-2026-11-11.md` for coverage and acceptance limits.

- 2026-11-06 dashboard continuation: phase 2 planning engine, explained Next bake, confirmed preorder aggregation, versioned parameters/events and private food-supplier invoice ledger implemented. Initial real sales capture and invoice samples verified. Comparisons/KPIs added with explicit data coverage; phase 3 history import, season factor and safety rules, and phase 4 remain pending. Website endpoints and signature contract unchanged. Historical queried stock is not used as proof of sell-out. See `docs/stock-operations.md` for acceptance gates and security boundaries. No production deployment from the feature branch.

- 2026-10-29 dashboard phase 1: website API unchanged; client follows section 4.6 including null IDs, fractional sales, seven-day refund refresh and history-window responses. Local draft/final closes, optimistic versions, audit, raw captures/catalogue and sync status/lease added. Running counts support mobile entry with explicit actual-production confirmation. Staff names are self-reported under the existing shared login. See `docs/stock-phase-one.md` for assumptions and acceptance gates. Stock writes remain in section 8 phase 4.

- 2026-10-28 v1: first version (Claude).
- 2026-10-29 v1.1: section 4.6 added; read endpoints built and tested; extra additive fields documented. Phase 4 write endpoint not built.

## 4.7 Contract v1.2 — pick-up day split and order ids (2026-11-11, additive)

Built in the website after Aitor approved the review (`docs/STOCK-REVIEW-2026-11-06.md`). All v1.1 fields keep their meaning.

`GET /api/internal/sales-daily` adds, per item:

| Field | Meaning |
|---|---|
| `unitsOnlineSameDay` | online units paid that day whose pick-up date is the same day (or unknown, for very old orders) |
| `unitsOnlineOtherDay` | online units paid that day for pick-up on another date; `unitsOnline = SameDay + OtherDay` |
| `hourlyInStore` | counter sales only, by Maine hour. Use this for sell-out curves; `hourly` still includes online units at payment time |

and, top level, `onlinePickups`: one entry per (Clover order, item) for every online line paid that day with a pick-up date other than that day:

```json
{ "orderId": "A4TP634P3P7K0", "pickupDate": "2026-11-25", "pickupTime": "10:00",
  "cloverItemId": "DS451ENN9BTXP", "name": "Thanksgiving Apple Cranberry Tart", "units": 1, "event": "thanksgiving" }
```

- `orderId` is the Clover order id, the same value the n8n sheet stores in `order_id`. Dedupe on it.
- `event` is `"thanksgiving"` when the order note carries `Event: Thanksgiving pre-order`, else `null`.
- No customer data is included.

Recommended use: base demand = `unitsInStore + unitsOnlineSameDay`; pre-orders for date D = union of `onlinePickups` with `pickupDate = D` (from all paid days) and sheet rows with pickup D whose `order_id` is not already in that set. Phone/in-person pre-orders only exist in the sheet.

Changelog: 2026-11-11 v1.2 built and tested against real Clover; deployed once Aitor approves the release.
