# Passport verification — 29 September 2026

| Requirement | Evidence / result |
| --- | --- |
| Normal order, exactly $40, $40.01 | PostgreSQL-engine tests pass: +1, +1, +2 |
| Duplicate, missing email, HMAC mismatch and old timestamp | Service tests and real Next HTTP authentication checks pass |
| 10 orders → one reward, expiry after 30 days | Pass; unique customer/card constraint and transactional issuance |
| 9 + double | Pass: 11 lifetime stamps, reward, one carryover stamp, completion image card-10.jpg |
| Subsequent orders and re-completion | Pass: new numbered cards and rewards every 10; no duplicate reward for the same card |
| Void and revoke | Pass: revoke only unsupported card numbers; preserve redeemed rewards |
| 20 stamps and legacy migration | Pass: two distinct rewards; tokens, orders and existing codes preserved |
| Validate/redeem, wrong email, expiry, second order, same-order retry | Pass |
| Login and secrets | Real production-build HTTP checks pass: login redirect, cookie attributes, guarded internal APIs, separate Passport secrets, cron retains its secret |
| TypeScript and build | Pass in Dashboard and PWA |
| Targeted new-code lint | Pass; PWA full lint also passes |
| Customer PWA | 20 browser tests pass, two engine-specific combinations intentionally skipped; see PWA verification |
| Email images | Eleven 1200 px JPGs, 175–185 KiB; 4/10-stamp placement visually compared with supplied mockups |

The ten service/security test groups use an isolated in-memory PostgreSQL engine (PGlite), never the live database. Repeated migrations pass; schema migration also takes an advisory transaction lock to serialize first-run DDL across instances. PGlite serializes transactions, so these tests do not certify production multi-connection contention; repeat concurrent ingest/redeem against a disposable PostgreSQL staging database before launch.

Commands: `npm run test:passport`, `npm run build`, `npm run test:passport:http`, `npx tsc --noEmit`; targeted ESLint on the new Passport/auth code. PWA: `npm run build`, `npm run lint`, `npm test`.

## Open launch checks

1. Actual Android Chrome and iPhone Safari installation, close and reopen from the OS home-screen icon. Emulator checks pass; physical device installation is not claimed.
2. Production deployment authorized and completed on 25 September 2026. Neon Free in Frankfurt is connected to the dashboard production environment; the three Passport tables were migrated without inserting customer/order fixtures. Production secrets are configured in both projects. Preview remains unconfigured.
3. Remediate the dependency audit. The owner explicitly chose to retain Next.js 16.2.1 and defer the security update; see the documented advisories in `swiss-passport.md`.
4. Review hosting access-log treatment of bearer URLs before launch. Application code does not log personal tokens; hosting logs are outside these repositories.

Recurring passports and carryover are restored as requested on 29 September. Existing API names, fields and secrets remain unchanged. validate/redeem handlers and authentication are untouched.

## Production smoke checks

- Dashboard: https://edelweiss-marketing-dashboard.vercel.app — deployment `dpl_CuUSCMiq4bf9yk1tyAj1MXdY7BYU`.
- PWA: https://passport.edelweisspastryshop.ch — deployment `dpl_7QVjTH7juPcHfCrLQJGNGVd7dDH4`.
- Passed: HTTPS landing on custom/default PWA domains, card image, login page, successful authenticated login and admin database read, unauthenticated admin/ingest rejection, authenticated nonexistent-card lookup (404), signed missing-email ingest (skipped, no order written), invalid-passport screen with noindex.
- The dashboard uses a newly generated password because Vercel does not export the previous sensitive password. Local operator credentials are in ignored `.vercel/passport-secrets.json`; never commit or publish that file.
- n8n and the separately owned checkout still need their respective integration secrets. These external systems were not modified by this deployment.

## Recurring passports deployment — 29 September 2026

Production READY: dashboard code commit 0417f1e (remote build 14 s), PWA code commit 106a7d7 (remote build 20 s). All 10 backend groups, real HTTP auth checks, targeted backend lint, PWA lint, both production builds and 20 browser tests passed (2 existing engine-specific skips). Migrated the card-number constraint in place. Post-deployment checks passed for HTTPS domains, image assets, signed ingest without email, authenticated reads, login and new onboarding. The original test order and customer token have the same before/after fingerprint and retain 2 stamps. No customer/order test fixtures were added in production. No n8n or main website changes. Runtime log/drain audit was not repeated in this change.
