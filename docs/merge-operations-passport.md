# Operations + Swiss Passport integration — 30 September 2026

Status: merged locally into main; deployment must wait for owner review/OK. No rebase, force push, secret rotation or production write was used.

## History

Base main: 5d4908e. First merge preserves all eight marketing commits through 2869d74. Second merge integrates Passport through 05cf5af. The Passport service, schema and all /api/passport handlers remain identical to that branch.

## Conflicts (14)

| File | Resolution |
| --- | --- |
| .gitignore | Retain Passport exclusions for its nested repository, env files, Vercel private files and test outputs. |
| README.md | Keep operational Sheet/adapter/calendar documentation; add signed login, Passport and main-only deployment policy. |
| src/app/api/content/route.ts | Keep Operations calendar CRUD/storage contract; require signed session and same-origin writes. |
| src/app/api/sync/route.ts | Preserve marketing sync response/history and provider-specific Data sync; require session and same-origin POST. |
| src/app/globals.css | Keep original Operations layout; isolate Passport/Instagram supporting styles under .studio-panel in studio.css. |
| src/app/layout.tsx | Preserve dashboard layout, set English language, load both scoped style sources. |
| src/app/page.tsx | Preserve real Sheet orders and Brevo subscribers/campaigns; authenticate before any read; retain Instagram and sync-status data. |
| src/components/ContentCalendar.tsx | Keep restored Operations calendar, editing and materials-needed view. |
| src/components/DashboardTabs.tsx | Combine recovered Orders/Email/Calendar/Meta navigation with Passport, Instagram, Data sync and sign out. |
| src/components/MetaAdsDashboard.tsx | Preserve recovered metric UI. |
| src/lib/content-types.ts | Preserve production calendar types; append distinct analytics types. Separate alternate Postgres editorial types into studio-content-types.ts. |
| src/lib/data.ts | Keep definitive Sheet URLs, all operational tabs, normalization, deduplication and currency totals. Detect explicit test notes/products. |
| src/proxy.ts | Preserve signed-session login and the existing Passport/cron auth exceptions. |
| vercel.json | Keep one daily job at 10:15 UTC. The old /api/cron/sync URL is retained as an authenticated alias. |

src/lib/db.ts merged without a Git conflict; only its editorial type import was adjusted. No database schema or data changes were made. The old cron self-call was replaced with direct server execution so login does not break scheduled sync.

## Verification

- Passport: 10 backend test groups pass; service and API diff against 05cf5af is empty.
- Build and TypeScript pass; authenticated HTTP checks cover recovered endpoints and cross-origin mutation rejection.
- Local production server reads the live Sheet: 232 orders, 14 special requests, 1 wholesale lead. Orders, date filters, Product insights, Email and Passport navigation verified in Chromium.
- The Sheet contains five orders for the owner's test email, dated September 19–20. No September 30 order for that email was found in either CSV or the authenticated Sheets connector. This requested acceptance case is pending an order ID/source clarification.
- Test orders can be shown; explicit DO NOT PREPARE rows stay outside revenue and product insights.
- No production deployment or main push yet. Local test processes use an empty DATABASE_URL, never the production database.

## Vercel Production environment inventory (names only)

| Section | Variables | Observed |
| --- | --- | --- |
| Login | DASHBOARD_PASSWORD, DASHBOARD_SESSION_SECRET | Present |
| Passport database | DATABASE_URL | Present |
| Passport APIs | PASSPORT_INGEST_SECRET, PASSPORT_READ_SECRET, PASSPORT_REDEEM_SECRET, PASSPORT_PUBLIC_BASE_URL, DOUBLE_STAMP_THRESHOLD_CENTS | Present |
| Brevo campaigns/subscribers | BREVO_API_KEY, BREVO_LIST_ID, BREVO_BIRTHDAY_ATTRIBUTE | Present |
| Scheduled jobs | CRON_SECRET | Present |
| Orders / special / wholesale / Sheets fallback | Sheet ID and gids in server code; no new env vars | Source reads successfully |
| Calendar write persistence / sync history | KV_REST_API_URL + KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN | Absent: restored calendar uses seed/read-only mode |
| Meta direct API | META_ACCESS_TOKEN, META_AD_ACCOUNT_ID; META_API_VERSION optional in campaign adapter, META_GRAPH_API_VERSION required for stored daily data | Absent; Sheets fallback retained |
| Instagram direct API | META_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ACCOUNT_ID, META_GRAPH_API_VERSION | Absent |
| Customer PWA (separate project) | PASSPORT_API_BASE_URL, PASSPORT_READ_SECRET | Both present; PWA unchanged |

Presence was checked with vercel env ls production, without reading or changing secret values. Historical DASHBOARD_BASIC_USER/PASSWORD remain stored but the app uses the signed-session password.
