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
2. Production deployment authorized and completed on 25 September 2026. Neon Free in Frankfurt is connected to the dashboard production environment; the three Passport tables were migrated without inserting customer/order fixtures. Production secrets are configured in both projects. Preview remains unconfigured.
3. Remediate the dependency audit. The owner explicitly chose to retain Next.js 16.2.1 and defer the security update; see the documented advisories in `swiss-passport.md`.
4. Review hosting access-log treatment of bearer URLs before launch. Application code does not log personal tokens; hosting logs are outside these repositories.

The initial brief's rollover/repeated-card tests are intentionally superseded by the user's explicit single-passport decision. All other API names, fields and secrets remain as specified.

## Production smoke checks

- Dashboard: https://edelweiss-marketing-dashboard.vercel.app — deployment `dpl_6qDbP7nwGHoF56g6WBDFumpykmpa`.
- PWA: https://passport.edelweisspastryshop.ch — deployment `dpl_8aQNLihnDaXQPvTqrzqXGYspRtBH`.
- Passed: HTTPS landing on custom/default PWA domains, card image, login page, successful authenticated login and admin database read, unauthenticated admin/ingest rejection, authenticated nonexistent-card lookup (404), signed missing-email ingest (skipped, no order written), invalid-passport screen with noindex.
- The dashboard uses a newly generated password because Vercel does not export the previous sensitive password. Local operator credentials are in ignored `.vercel/passport-secrets.json`; never commit or publish that file.
- n8n and the separately owned checkout still need their respective integration secrets. These external systems were not modified by this deployment.
