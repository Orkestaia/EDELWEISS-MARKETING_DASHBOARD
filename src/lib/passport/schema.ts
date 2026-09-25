export const schema = [
  `create table if not exists passport_customers (
    id uuid primary key, email text unique not null, first_name text,
    token text unique not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
  )`,
  `create table if not exists passport_orders (
    id uuid primary key, customer_id uuid not null references passport_customers(id),
    source text not null default 'clover-online', external_order_id text not null,
    subtotal_cents int not null, total_cents int not null,
    stamps_awarded smallint not null check (stamps_awarded in (1,2)),
    status text not null default 'valid' check (status in ('valid','voided')), void_reason text,
    ordered_at timestamptz not null default now(), created_at timestamptz not null default now(),
    unique(source, external_order_id)
  )`,
  `create index if not exists passport_orders_customer_idx on passport_orders(customer_id, ordered_at)`,
  `create table if not exists passport_rewards (
    id uuid primary key, customer_id uuid not null references passport_customers(id), card_number int not null default 1 check(card_number=1),
    code text unique not null, percent int not null default 15 check(percent=15),
    issued_at timestamptz not null default now(), expires_at timestamptz not null default (now() + interval '30 days'),
    status text not null default 'active' check(status in ('active','redeemed','expired','revoked')),
    redeemed_at timestamptz, redeemed_order_id text, triggered_by_order_id uuid references passport_orders(id),
    unique(customer_id, card_number)
  )`
];
