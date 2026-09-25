# Edelweiss Swiss Passport

## Owner-approved amendment, 25 September 2026

The initial brief's recurring cards and carryover are superseded by the owner's explicit confirmation:

- One passport per customer, capped at 10 displayed/usable stamps.
- One reward may be issued in its lifetime. Voiding an order and reaching 10 again never issues a replacement, including when the first reward was redeemed.
- No next card, no carryover. A different passport may be designed later.
- 9 + a double-stamp order finishes at 10; `stampsAdded: 1`, `doubleStamp: true`, `carryOver: 0`.
- Later orders remain in the order ledger for idempotency and administration, but `stampsAdded: 0`, `totalStamps: 10`, `stampsOnCard: 10`, `cardsCompleted: 1`; no additional reward.
- The ledger records the original 1/2 award for each valid order; progress is `min(10, sum(valid awards))`. History shows those original awards. No hidden balance is banked for a future passport.
- Completed maps stay at 10/10 when the reward is redeemed, expired or revoked (unless a void actually reduces the valid ledger below 10).

These are the only intentional changes to the original business rules. The route paths, authentication headers and JSON field names remain unchanged. The administrative void operation is retained as requested by the original brief, although the owner says it will not normally be used.

## Configuration and operation

See `.env.example`. All secrets are server-only. Generate independent random secrets (at least 32 bytes); never reuse the session, read, redeem, ingest or cron secrets. `DASHBOARD_SESSION_SECRET` requires at least 32 characters. Login is fail-closed when configuration is missing. Sessions last 8 hours and use signed, HttpOnly, SameSite=Lax cookies (Secure in production).

`src/proxy.ts` protects dashboard pages and internal APIs. Passport routes and the existing cron keep their separate authentication. Admin Passport routes additionally verify the session at the handler. Browser mutations check Origin. The cron's existing `CRON_SECRET` is unchanged.

Tables are created idempotently on the first authorized Passport request. No Passport schema or historical orders are seeded during build. The live `DATABASE_URL` is never used by tests. Do not call ingest on production until launch: the ingestion time is `ordered_at`, since the payload has no actual order timestamp (`pickupDate` is not a payment timestamp).

Orders have unique `(source, external_order_id)` and customer/reward changes occur in the same transaction. An advisory lock serializes a given external order even if a retry changes the email; upsert locks serialize orders for one customer. A unique `(customer_id, card_number)` constraint enforces one lifetime reward. Code collisions retry without aborting the transaction. Tokens are random 32-byte base64url values.

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

The automated suite uses PGlite's PostgreSQL engine in memory: thresholds, HMAC freshness/body integrity, sessions, normalized identity, duplicates, no email, lifecycle, cap/no carryover, void/revocation/no reissue, expiry and atomic redemption. PGlite serializes transactions; production PostgreSQL multi-connection locking should additionally be exercised in a staging database before launch.

The PWA PR contains browser tests, image generation and installation checks. A browser emulator cannot certify real OS home-screen installation; the native Android and iPhone acceptance check must be recorded on actual devices before launch.

No production deployment or production database mutation is part of this implementation.

## Known security dependency issue — owner deferred update

On 25 September 2026 npm audit flagged Next.js 16.2.1 and transitive dependencies (including critical advisories). The owner explicitly chose to keep the version and defer remediation. Server pages and internal API handlers verify sessions as defense in depth, but this does not resolve all upstream vulnerabilities. Upgrade and re-audit before production launch. See https://github.com/vercel/next.js/security/advisories/GHSA-267c-6grr-h53f and https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36.

