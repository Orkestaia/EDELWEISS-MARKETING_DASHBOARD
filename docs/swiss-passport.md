# Edelweiss Swiss Passport

## Recurring passports — confirmed 29 September 2026

- Lifetime total is the sum of valid order stamps; completed cards = floor(total / 10), current progress = total % 10.
- Every newly completed card earns its own 15% reward, valid for 30 days. Extra stamps carry forward: 9 + double = 11 lifetime stamps, reward for card 1 and one stamp on card 2.
- Ingest on completion returns cardCompleted:true, the newly issued reward, card-10.jpg and carryOver. latestStops follows order of earning, e.g. [10, 1], then restarts at Zürich for the new card. Other response names and authentication are unchanged.
- With an active reward and no remainder the PWA displays 10/10; with a remainder it displays the new card. Without an active reward it displays the remainder, including 0/10.
- The existing singular reward field shows the active reward expiring first; once used/expired, the next active reward appears. Completion ingest always returns the newly issued code so n8n can announce it.
- One reward per customer/card_number remains enforced: voiding revokes unredeemed rewards above floor(valid stamps / 10). Redeemed rewards survive, and re-completing the same card does not issue another code for that card.
- The idempotent migration removes only the old card_number=1 restriction and enforces positive card numbers. Existing tokens, orders and rewards are retained.

## Configuration and operation

See `.env.example`. All secrets are server-only. Generate independent random secrets (at least 32 bytes); never reuse the session, read, redeem, ingest or cron secrets. `DASHBOARD_SESSION_SECRET` requires at least 32 characters. Login is fail-closed when configuration is missing. Sessions last 8 hours and use signed, HttpOnly, SameSite=Lax cookies (Secure in production).

`src/proxy.ts` protects dashboard pages and internal APIs. Passport routes and the existing cron keep their separate authentication. Admin Passport routes additionally verify the session at the handler. Browser mutations check Origin. The cron's existing `CRON_SECRET` is unchanged.

Tables are created idempotently on the first authorized Passport request. No Passport schema or historical orders are seeded during build. The live `DATABASE_URL` is never used by tests. Do not call ingest on production until launch: the ingestion time is `ordered_at`, since the payload has no actual order timestamp (`pickupDate` is not a payment timestamp).

Orders have unique `(source, external_order_id)` and customer/reward changes occur in the same transaction. An advisory lock serializes a given external order even if a retry changes the email; upsert locks serialize orders for one customer. A unique `(customer_id, card_number)` constraint enforces one reward per numbered card. Code collisions retry without aborting the transaction. Tokens are random 32-byte base64url values.

Reward validation/redeeming requires the customer's normalized email. A successful redeem returns `{valid:true,percent:15,duplicate:false}`; retrying it with the same order returns `{valid:true,percent:15,duplicate:true}`. Another order returns `{valid:false,reason:"redeemed"}`. The update checks active status and expiry atomically. Expiry is applied on reads, validation and the existing daily cron.

Duplicate ingest returns the current card/reward state and `duplicate:true`, `stampsAdded:0`, `cardCompleted:false`, `latestStops:[]`. It cannot emit a second reward or replay a completion email as a new completion. Invalid JSON/amounts yield 400; missing/incorrect secrets yield 401; database unavailability yields 503 without logging customer data.

## Integration endpoints

- `POST /api/passport/ingest`: HMAC of the exact UTF-8 raw body, timestamp in epoch seconds, ±300-second freshness window.
- `GET /api/passport/card/{token}`: `Authorization: Bearer PASSPORT_READ_SECRET`. Whitelisted personal data; no email or amounts.
- `POST /api/passport/rewards/validate` and `/redeem`: `Authorization: Bearer PASSPORT_REDEEM_SECRET`.
- `GET /api/admin/passport`: dashboard session only; optional `?customer=<uuid>` for ledger/rewards.
- `POST /api/admin/passport`: session and matching Origin; `{orderId:<internal uuid>,reason:<nonempty text>}`.

`src/lib/passport/stops.json` is the editorial source of truth. The PWA contains its identical versioned copy at `src/lib/stops.json` so both independent builds remain reproducible. When editing copy, update that copy in the accompanying PWA PR. Coordinates always come from the supplied `slots.json`.

## Signed curl example

The script below prints a ready-to-run curl command and optionally sends it. Set `PASSPORT_INGEST_SECRET` in your local environment (not in source control), then run:

```sh
node scripts/passport-curl.mjs https://YOUR-DASHBOARD-HOST --send
```

The payload uses a clearly marked test email. Run against an isolated preview/test database, not production. Repeating its order ID tests idempotency. n8n must sign the exact serialized string it sends, without reformatting JSON after signing.

## Verification

```sh
npm ci
npm run test:passport
npx tsc --noEmit
npm run build
```

The automated suite uses PGlite's PostgreSQL engine in memory: thresholds, HMAC freshness/body integrity, sessions, normalized identity, duplicates, no email, lifecycle, rollover, repeated rewards, void/revocation/no reissue for the same card, expiry and atomic redemption. PGlite serializes transactions; production PostgreSQL multi-connection locking should additionally be exercised in a staging database before launch.

The PWA PR contains browser tests, image generation and installation checks. A browser emulator cannot certify real OS home-screen installation; the native Android and iPhone acceptance check must be recorded on actual devices before launch.

Production deployment was authorized. See passport-verification.md for deployment checks.

## Known security dependency issue — owner deferred update

On 25 September 2026 npm audit flagged Next.js 16.2.1 and transitive dependencies (including critical advisories). The owner explicitly chose to keep the version and defer remediation. Server pages and internal API handlers verify sessions as defense in depth, but this does not resolve all upstream vulnerabilities. Upgrade and re-audit before production launch. See https://github.com/vercel/next.js/security/advisories/GHSA-267c-6grr-h53f and https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36.

