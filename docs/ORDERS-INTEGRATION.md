# Orders and special requests integration

## Current state

The dashboard contains an empty Operations Inbox and a normalized persistence model. It deliberately contains no sample customer or order data. No Clover, website, email, or n8n connector is active yet.

## Integration boundary

The preorder application remains the system of record for checkout and payment. The marketing dashboard will receive a read-only operational projection containing only the fields required to coordinate preparation and pickup. It must not recreate payment processing or write directly to Clover orders unless that requirement is explicitly approved later.

All incoming sources map to one `OperationsItem`: source, kind, status, customer contact, summary, requested pickup time, amount, source URL, and timestamps. The original external identifier is retained for idempotent updates.

## Information required from the preorder project

- Framework, hosting provider, repository, and production domain.
- Current database and order schema, with sensitive fields redacted.
- Clover integration method: official SDK/API, OAuth flow, webhooks, merchant ID, and token storage location.
- Order lifecycle and exact status names.
- Pickup date/time and timezone behavior.
- Whether refunds, cancellations, taxes, tips, discounts, and partial payments must appear.
- Existing webhook endpoints and signature verification.
- n8n workflow summary, trigger, payload sample with personal data removed, and retry behavior.
- Website form provider and the stable request/order identifier.
- Who should be allowed to see customer names, email addresses, phone numbers, and order notes.

## Proposed safe flow

1. Clover or the preorder application remains authoritative.
2. A signed server-to-server webhook sends a minimum-data event to this dashboard.
3. The dashboard validates the signature, rejects replays, and upserts by source plus external ID.
4. A scheduled reconciliation job corrects missed webhooks.
5. n8n sends special requests through a separate signed endpoint using the same normalized model.
6. Raw email bodies and payment credentials are never stored in the dashboard.

## Planned environment variables

Names are provisional until the existing implementation is audited:

- `CLOVER_MERCHANT_ID` — identifier, not treated as a secret.
- `CLOVER_ACCESS_TOKEN` — secret, server only.
- `CLOVER_WEBHOOK_SECRET` — secret, server only.
- `N8N_INGEST_SECRET` — secret shared only between n8n and the dashboard.
- `OPERATIONS_RECONCILE_SECRET` — secret for scheduled reconciliation.

Do not add these variables until the actual Clover authentication model and existing project are reviewed.
