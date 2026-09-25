# Passport verification — 25 September 2026

| Requirement | Evidence / result |
| --- | --- |
| Normal order, exactly $40, $40.01 | PostgreSQL-engine tests pass: +1, +1, +2 |
| Duplicate, missing email, HMAC mismatch and old timestamp | Service tests and real Next HTTP authentication checks pass |
| 10 orders → one reward, expiry after 30 days | Pass; unique customer/card constraint and transactional issuance |
| 9 + double | Pass under the owner-approved amendment: 10/10, no carryover, one usable stamp added |
| Subsequent orders and re-completion | Pass: no further usable progress and no reward reissue |
| Void and revoke | Pass, including redeemed reward preservation |
| Validate/redeem, wrong email, expiry, second order, same-order retry | Pass |
| Login and secrets | Real production-build HTTP checks pass: login redirect, cookie attributes, guarded internal APIs, separate Passport secrets, cron retains its secret |
| TypeScript and build | Pass in Dashboard and PWA |
| Targeted new-code lint | Pass; PWA full lint also passes |
| Customer PWA | 16 browser tests pass, two engine-specific combinations intentionally skipped; see PWA verification |
| Email images | Eleven 1200 px JPGs, 175–185 KiB; 4/10-stamp placement visually compared with supplied mockups |

The eight service/security test groups use an isolated in-memory PostgreSQL engine (PGlite), never the live database. Repeated migrations pass; schema migration also takes an advisory transaction lock to serialize first-run DDL across instances. PGlite serializes transactions, so these tests do not certify production multi-connection contention; repeat concurrent ingest/redeem against a disposable PostgreSQL staging database before launch.

Commands: `npm run test:passport`, `npm run build`, `npm run test:passport:http`, `npx tsc --noEmit`; targeted ESLint on the new Passport/auth code. PWA: `npm run build`, `npm run lint`, `npm test`.

## Open launch checks

1. Actual Android Chrome and iPhone Safari installation, close and reopen from the OS home-screen icon. Emulator checks pass; physical device installation is not claimed.
2. Configure production/preview environment variables and the PWA domain only when launch is authorized. No live schema mutation or production deployment was performed.
3. Remediate the dependency audit. The owner explicitly chose to retain Next.js 16.2.1 and defer the security update; see the documented advisories in `swiss-passport.md`.
4. Review hosting access-log treatment of bearer URLs before launch. Application code does not log personal tokens; hosting logs are outside these repositories.

The initial brief's rollover/repeated-card tests are intentionally superseded by the user's explicit single-passport decision. All other API names, fields and secrets remain as specified.
