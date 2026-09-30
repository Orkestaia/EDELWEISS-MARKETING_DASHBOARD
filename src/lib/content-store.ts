import 'server-only';
import { SEPTEMBER_CONTENT } from './content-seed';
import type { ContentItem, ContentStore } from './content-types';

const STORE_KEY = 'edelweiss:content:v1';
const SYNC_KEY = 'edelweiss:sync-history:v1';
const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(command: unknown[]) {
  if (!redisUrl || !redisToken) throw new Error('PERSISTENCE_NOT_CONFIGURED');
  const response = await fetch(redisUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`REDIS_${response.status}`);
  const payload = await response.json() as { result?: unknown; error?: string };
  if (payload.error) throw new Error(payload.error);
  return payload.result;
}

export function persistenceConfigured() { return Boolean(redisUrl && redisToken); }

export async function readContentStore(): Promise<ContentStore> {
  if (!persistenceConfigured()) return { items: SEPTEMBER_CONTENT, updatedAt: '2026-09-01T00:00:00.000Z', storage: 'seed' };
  const raw = await redis(['GET', STORE_KEY]);
  if (!raw) {
    const initial = { items: SEPTEMBER_CONTENT, updatedAt: new Date().toISOString() };
    await redis(['SET', STORE_KEY, JSON.stringify(initial)]);
    return { ...initial, storage: 'redis' };
  }
  const parsed = JSON.parse(String(raw)) as Omit<ContentStore, 'storage'>;
  return { ...parsed, storage: 'redis' };
}

export async function writeContentItems(items: ContentItem[]): Promise<ContentStore> {
  if (!persistenceConfigured()) throw new Error('PERSISTENCE_NOT_CONFIGURED');
  const value = { items, updatedAt: new Date().toISOString() };
  await redis(['SET', STORE_KEY, JSON.stringify(value)]);
  return { ...value, storage: 'redis' };
}

export async function appendSyncHistory(entry: unknown) {
  if (!persistenceConfigured()) return;
  await redis(['LPUSH', SYNC_KEY, JSON.stringify(entry)]);
  await redis(['LTRIM', SYNC_KEY, 0, 29]);
}

export async function readSyncHistory(): Promise<unknown[]> {
  if (!persistenceConfigured()) return [];
  const rows = await redis(['LRANGE', SYNC_KEY, 0, 29]) as string[] | null;
  return (rows || []).map((row) => JSON.parse(row));
}
