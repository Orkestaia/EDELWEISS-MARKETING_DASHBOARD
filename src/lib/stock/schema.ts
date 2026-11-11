export const stockSchema = [
  `create table if not exists plan_products (
    product_key text primary key, clover_item_id text unique, display_name text not null,
    family text not null, active boolean not null default true,
    seasonal_from date, seasonal_to date, units_per_tray integer not null default 1,
    pieces_per_dough_batch integer, lead_days integer not null default 0,
    target_sellout_time time not null default '12:00', buffer_k numeric not null default 1,
    max_waste_pct numeric not null default 15, price_cents integer, unit_cost_cents integer,
    par_mon integer not null, par_tue integer not null, par_wed integer not null,
    par_thu integer not null, par_fri integer not null, par_sat integer not null, par_sun integer not null,
    mapping_note text not null default '', version integer not null default 1
  )`,
  `create table if not exists plan_days (
    date date not null, product_key text not null references plan_products(product_key),
    suggested integer not null check (suggested >= 0), planned integer not null check (planned >= 0),
    override_reason text, explain jsonb not null, created_by text not null,
    version integer not null default 1, primary key(date, product_key)
  )`,
  `create table if not exists daily_sales (
    date date not null, product_key text not null references plan_products(product_key),
    units_in_store numeric not null, units_online numeric not null, revenue_cents bigint not null,
    first_sale_at time, last_sale_at time, hourly jsonb not null, stock_end integer,
    primary key(date, product_key)
  )`,
  `create table if not exists daily_close (
    date date not null, product_key text not null references plan_products(product_key),
    baked integer check (baked >= 0), leftover integer check (leftover >= 0),
    tgtg integer not null check (tgtg >= 0), reused integer not null check (reused >= 0),
    discarded integer not null check (discarded >= 0), sold_out boolean not null,
    sold_out_at time, entered_by text not null, entered_at timestamptz not null default now(),
    status text not null check (status in ('draft','closed')), version integer not null default 1,
    primary key(date, product_key), check (leftover is null or baked is null or leftover <= baked),
    check (leftover is null or tgtg + reused + discarded <= leftover),
    check (status = 'draft' or (baked is not null and leftover is not null))
  )`,
  `create table if not exists stock_catalog (clover_item_id text primary key, payload jsonb not null)`,
  `create table if not exists stock_feed_days (
    date date primary key, complete boolean not null, generated_at timestamptz not null,
    received_at timestamptz not null default now(), payload jsonb not null
  )`,
  `create table if not exists stock_audit (
    id bigserial primary key, entity text not null, entity_key text not null,
    actor text not null, changed_at timestamptz not null default now(), payload jsonb not null
  )`,
  `create table if not exists stock_sync_runs (
    id bigserial primary key, status text not null, message text not null, created_at timestamptz not null default now()
  )`,
  `create table if not exists stock_sync_lock (
    id integer primary key check (id = 1), token text not null, expires_at timestamptz not null
  )`,
  // Repair data written by older postgres.js adapters which double-serialized JSON.
  `update stock_feed_days set payload=(payload #>> '{}')::jsonb where jsonb_typeof(payload)='string'`,
  `update stock_catalog set payload=(payload #>> '{}')::jsonb where jsonb_typeof(payload)='string'`,
  `update daily_sales set hourly=(hourly #>> '{}')::jsonb where jsonb_typeof(hourly)='string'`,
  `update plan_days set explain=(explain #>> '{}')::jsonb where jsonb_typeof(explain)='string'`,
  `update stock_audit set payload=(payload #>> '{}')::jsonb where jsonb_typeof(payload)='string'`,
  // Opaque provenance survives a refunded pickup disappearing from a refreshed
  // capture, so a stale paid Sheet row cannot resurrect that website order.
  `create table if not exists stock_pickup_order_sources (
    order_id text primary key, paid_date date not null
  )`,
  `insert into stock_pickup_order_sources(order_id,paid_date)
    select distinct on (i->>'orderId') i->>'orderId',f.date from stock_feed_days f
    cross join lateral jsonb_array_elements(coalesce(f.payload->'onlinePickups','[]'::jsonb)) i
    where i->>'orderId' is not null order by i->>'orderId',f.date
    on conflict(order_id) do nothing`,
];
