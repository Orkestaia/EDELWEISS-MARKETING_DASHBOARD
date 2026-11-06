# Stock & Production — phase 1

Historical phase-one record, 2026-10-29. The implementation has since advanced: see [stock-operations.md](stock-operations.md) for the current status, live-data validation, planning and purchasing features. Pending setup and deferred-feature statements below describe the original phase-one delivery.

The manual bakery workspace lives at `/stock`, linked from dashboard navigation and the former online-only production forecast. No statistical forecast or stock write to Clover is enabled.

## Daily use

- **Today & close:** enter actual production during the day; finish each product after counting leftovers and their destinations. The plan is a placeholder until explicitly confirmed with `Confirm baked = plan`. Zero is a count; blank means unknown.
- If a product was baked exactly as planned and sold out, the explicit `Baked … as planned · all sold` action confirms and closes it in one tap. Other products keep the full count form.
- Valid changes autosave as drafts after 1.5 seconds when a staff name is present. Errors stay visible. Unsaved counts can be restored from temporary storage in the same browser tab after navigation or reload. This is not full offline operation: a save is confirmed only when the server responds.
- **Week plan:** editable Monday–Sunday quantities, totals per day and family. Mobile offers one day at a time. Changes greater than 20% of the original manual baseline require a reason. Date edits do not change recurring defaults.
- **Products:** recurring manual quantities and explicit catalogue mapping. Exact names map automatically only when unambiguous. The two provisional Kuchen names require review. Defaults do not overwrite saved date plans.
- **Print week:** complete week, all families, Letter landscape. Confirmed pre-orders must be included manually in date plans until phase 2.

## Setup and scheduling

Server-only configuration: `DATABASE_URL`, `DASHBOARD_FEED_SECRET`, existing dashboard login/session secrets, and `CRON_SECRET`. The feed secret must match the website configuration. No Clover credential belongs in this repository. Never put secret values in source, logs or chat.

`GET /api/stock?week=YYYY-MM-DD` returns that Monday–Sunday view. Without a database it returns the seed explicitly read-only. A configured but unreachable database returns an error. `POST /api/stock` accepts versioned `plan`, `close` and `product` actions. Stock APIs require the existing session; mutations require same Origin.

`POST /api/stock/sync` manually pulls catalogue and daily history. `GET /api/cron/stock-snapshot` requires the existing cron Bearer secret. Two daily UTC schedules, 06:30 and 07:30, cover daylight and standard time. A Maine-local 02:00–03:59 guard excludes the early invocation in winter and allows 03:30 when spring skips 02:30. An expiring sync lease excludes concurrent pulls; upserts prevent duplicates. The summer second invocation can continue unfinished backfill. Vercel Hobby has up to an hour of scheduling imprecision; exact 02:30 requires minute-precision scheduling.

Each run refreshes the most recent seven days for late refunds (section 4.6), then fills missing/incomplete days up to 90 days back. Requests run sequentially. The feed's HTTP 422 `oldestAvailable` boundary is respected without inventing a zero-sales day. Network/5xx failures receive one further attempt with a fresh signature; authentication failures do not. Each request has a 10-second timeout. A 200-second working budget leaves headroom within the route's 300-second limit. Unfinished backfill resumes on the next run. The optional live 15-minute feed is deferred.

Raw snapshots retain completeness, generation/receipt timestamps and all feed items, including unmapped products and deleted items with null Clover IDs. Mapped sales are materialized separately and replayed when mappings change. Older snapshots and incomplete replacements of complete days are rejected. A complete empty/zero response means no sales; no capture means data pending. Signed fractional sales preserve feed quantities and refunds. Manual production inputs remain whole pieces pending business confirmation.

## Local model additions and assumptions

The website API contract is unchanged. Additions to the proposed local schema:

- `stock_feed_days`: raw snapshots, completeness and timestamps.
- `stock_catalog`: catalogue for staff mapping.
- `stock_audit`: previous values and changes with actor and timestamp.
- `stock_sync_runs`, `stock_sync_lock`: status and owner-specific expiring lease.
- Optimistic versions on products, date plans and closes; stale writes return HTTP 409.
- Draft/final status and nullable unconfirmed baked/leftover quantities in `daily_close`.

The shared login does not establish individual identity or owner/staff roles. Actor names are self-reported. Individual accounts remain an access-control decision.

TGTG, reused and discarded are subsets of leftovers. Unallocated remainder is displayed explicitly; its destination/retention needs confirmation. No automatic carryover to tomorrow is applied. Leftovers cannot exceed baked quantities. Sold out cannot coexist with positive leftovers. Clover's queried stock is not closing stock: it may include later restocks, particularly on seven-day refreshes. Automatic sell-out confirmation and opening/14:10 stock captures are deferred until the operating schedule and interpretation are confirmed.

Running counts retain their latest state and an audit of saves. This is not yet an additive movement ledger for receipts, removals and batches. Optional automatic stock-inference ideas have not been enabled.

## Verification and pending acceptance

- `npm run test:stock`: CSV, dates/DST, HMAC, validation and real Postgres-engine integration through PGlite; durable snapshots/backfill, plans, mapping, conflicts and audit.
- `npm run test:stock:http`: real Next.js HTTP authentication, CSRF, strict dates, missing configuration and seed view. Run after build.
- `npm run test:stock:browser`: mobile/desktop workflows using the real stock service and isolated PGlite through browser request interception. This validates UI/service integration; actual Next route authorization is covered separately by HTTP tests. External feed uses fixtures. Run after build; optionally set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed test browser.
- Existing Swiss Passport tests provide regression coverage.

Pending: website deployment and environment setup, live feed validation, confirmed units and two Kuchen mappings, and a measured staff close. Seven stored **real** daily snapshots and a staff close under two minutes remain acceptance gates. Fixtures do not satisfy them. Production deployment follows clean integrated-main policy.

Supplier Gmail analysis and purchasing automation are a later integration. This implementation reads no mailbox.

## Verification record — 2026-10-29

- Production build passed with Next.js 16.2.1 / Turbopack. The CSV is present in the stock route's output-file trace. Windows sandbox prevented the CSS helper from starting on the initial attempt; the approved local build outside that sandbox succeeded.
- Stock tests: 12 passed, including seven-day refund refresh, deleted-item retention and out-of-window handling. Existing Passport suite: 10 passed.
- Actual HTTP suite passed: private page/API, CSRF, strict dates, oversized requests, seed read-only mode and configuration errors.
- Browser suite passed: saved close survives reload, failed autosave preserves input and retries, stale edits produce conflicts, explicit one-tap sold-out close, plan reasons/defaults, no overflow at 320px, and single-page Letter PDF. Browser data is isolated test data, not production evidence.
- ESLint on `src`, `tests` and `next.config.ts` passed. Full-repository lint reports 25 pre-existing CommonJS import errors in local `.vercel/*.cjs` and `output/passport-carousel/render.cjs`; those scripts were not changed.
- Review images and print sample: `output/stock-phase-one/`. No production deployment performed.

Scheduling reference: [Vercel cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
