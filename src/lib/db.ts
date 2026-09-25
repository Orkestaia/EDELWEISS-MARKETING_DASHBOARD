import "server-only";
import postgres from "postgres";
import type { Campaign, ContentItem, MarketingSnapshot, OperationsItem, SyncStatus } from "./content-types";
import { campaigns, initialContent } from "./editorial-seed";

const databaseUrl = process.env.DATABASE_URL;
const sql = databaseUrl ? postgres(databaseUrl, { ssl: "require", max: 3, idle_timeout: 20 }) : null;

export const isDatabaseConfigured = () => Boolean(sql);

export async function ensureSchema() {
  if (!sql) return false;
  await sql`
    create table if not exists content_items (
      id text primary key,
      payload jsonb not null,
      scheduled_at timestamptz not null,
      campaign text not null default '',
      format text not null,
      status text not null,
      owner_name text not null,
      updated_at timestamptz not null default now()
    )`;
  await sql`create table if not exists campaigns (id text primary key, payload jsonb not null, updated_at timestamptz not null default now())`;
  await sql`create table if not exists sync_runs (id bigserial primary key, provider text not null, status text not null, message text not null default '', records integer not null default 0, created_at timestamptz not null default now())`;
  await sql`create table if not exists marketing_snapshots (id bigserial primary key, provider text not null, external_id text not null, snapshot_date date not null, level text not null, payload jsonb not null, unique(provider, external_id, snapshot_date, level))`;
  await sql`create table if not exists operations_items (
    id text primary key,
    external_id text,
    source text not null,
    kind text not null,
    status text not null,
    requested_for timestamptz,
    payload jsonb not null,
    created_at timestamptz not null,
    updated_at timestamptz not null default now(),
    unique(source, external_id)
  )`;
  for (const item of initialContent) await upsertContent(item, true);
  for (const campaign of campaigns) await sql`insert into campaigns (id, payload) values (${campaign.id}, ${sql.json(JSON.parse(JSON.stringify(campaign)))}) on conflict (id) do nothing`;
  return true;
}

export async function listContent(): Promise<ContentItem[]> {
  if (!sql) return initialContent;
  await ensureSchema();
  const rows = await sql`select payload from content_items order by scheduled_at`;
  return rows.map((row) => row.payload as ContentItem);
}

export async function listCampaigns(): Promise<Campaign[]> {
  if (!sql) return campaigns;
  await ensureSchema();
  const rows = await sql`select payload from campaigns order by id`;
  return rows.map((row) => row.payload as Campaign);
}

export async function upsertContent(item: ContentItem, seed = false) {
  if (!sql) throw new Error("DATABASE_URL is not configured");
  const query = sql`insert into content_items (id, payload, scheduled_at, campaign, format, status, owner_name) values (${item.id}, ${sql.json(JSON.parse(JSON.stringify(item)))}, ${item.scheduledAt}, ${item.campaign}, ${item.format}, ${item.status}, ${item.owner})`;
  if (seed) await sql`${query} on conflict (id) do nothing`;
  else await sql`${query} on conflict (id) do update set payload = excluded.payload, scheduled_at = excluded.scheduled_at, campaign = excluded.campaign, format = excluded.format, status = excluded.status, owner_name = excluded.owner_name, updated_at = now()`;
}

export async function deleteContent(id: string) { if (!sql) throw new Error("DATABASE_URL is not configured"); await sql`delete from content_items where id = ${id}`; }

export async function getSyncStatuses(): Promise<SyncStatus[]> {
  const providers = ["brevo", "meta", "instagram"] as const;
  if (!sql) return providers.map((provider) => ({ provider, configured: provider === "brevo" ? Boolean(process.env.BREVO_API_KEY) : Boolean(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID), status: "pending", lastSyncedAt: null, message: "Database pending; history cannot be stored yet." }));
  await ensureSchema();
  const rows = await sql`select distinct on (provider) provider, status, message, created_at from sync_runs order by provider, created_at desc`;
  return providers.map((provider) => {
    const row = rows.find((entry) => entry.provider === provider);
    const configured = provider === "brevo" ? Boolean(process.env.BREVO_API_KEY) : provider === "meta" ? Boolean(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID && process.env.META_GRAPH_API_VERSION) : Boolean(process.env.META_ACCESS_TOKEN && process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID && process.env.META_GRAPH_API_VERSION);
    return { provider, configured, status: (row?.status ?? "pending") as SyncStatus["status"], lastSyncedAt: row?.created_at?.toISOString?.() ?? null, message: row?.message ?? "Not synchronized yet." };
  });
}

export async function saveSyncRun(provider: string, status: string, message: string, records = 0) { if (!sql) throw new Error("DATABASE_URL is not configured"); await sql`insert into sync_runs (provider, status, message, records) values (${provider}, ${status}, ${message}, ${records})`; }
export async function saveSnapshot(provider: string, externalId: string, date: string, level: string, payload: unknown) { if (!sql) throw new Error("DATABASE_URL is not configured"); await sql`insert into marketing_snapshots (provider, external_id, snapshot_date, level, payload) values (${provider}, ${externalId}, ${date}, ${level}, ${sql.json(JSON.parse(JSON.stringify(payload)))}) on conflict (provider, external_id, snapshot_date, level) do update set payload = excluded.payload`; }

export async function listSnapshots(provider: string, days = 120): Promise<MarketingSnapshot[]> {
  if (!sql) return [];
  await ensureSchema();
  const rows = await sql`select provider, external_id, snapshot_date, level, payload from marketing_snapshots where provider = ${provider} and snapshot_date >= current_date - ${days}::integer order by snapshot_date desc`;
  return rows.map((row) => ({ provider: String(row.provider), externalId: String(row.external_id), snapshotDate: new Date(row.snapshot_date).toISOString().slice(0, 10), level: String(row.level), payload: row.payload as Record<string, unknown> }));
}

export async function listOperationsItems(): Promise<OperationsItem[]> {
  if (!sql) return [];
  await ensureSchema();
  const rows = await sql`select payload from operations_items order by coalesce(requested_for, created_at) asc`;
  return rows.map((row) => row.payload as OperationsItem);
}
