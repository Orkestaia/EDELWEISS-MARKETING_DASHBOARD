import { createHmac } from "node:crypto";
import { dateKey } from "./domain";
import type { CatalogItem, OnlinePickup, SalesFeed } from "./types";

export const FEED_ORIGIN = "https://www.edelweisspastryshop.ch";
export class FeedError extends Error {}
export class FeedWindowError extends FeedError {
  constructor(public oldestAvailable: string) { super(`Clover history starts on ${oldestAvailable}.`); }
}
const object = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const numeric = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e12;
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 500;
const time = (v: unknown) => v === null || (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v));
const hourly = (v: unknown): v is Record<string, number> => object(v) && Object.entries(v).every(([h, n]) => /^(?:[0-9]|1[0-9]|2[0-3])$/.test(h) && numeric(n));
export function isPickupAwareFeed(feed: SalesFeed): feed is SalesFeed & { onlinePickups: OnlinePickup[] } {
  return Array.isArray(feed.onlinePickups) && feed.items.every(item => numeric(item.unitsOnlineSameDay) && numeric(item.unitsOnlineOtherDay) && hourly(item.hourlyInStore));
}
export function feedSignature(secret: string, path: string, now = Date.now()) {
  const t = Math.floor(now / 1000);
  const mac = createHmac("sha256", secret).update(`${t}.GET ${path}.`).digest("hex");
  return `t=${t},v1=${mac}`;
}
export function parseCatalog(raw: unknown): CatalogItem[] {
  if (!object(raw) || !Array.isArray(raw.items) || raw.items.length > 10000) throw new FeedError("Invalid catalogue response.");
  const ids = new Set<string>();
  return raw.items.map(v => {
    if (!object(v) || !text(v.cloverItemId) || !text(v.name) || !Number.isSafeInteger(v.priceCents) || Number(v.priceCents) < 0 || typeof v.tracked !== "boolean" || !(v.stock === null || numeric(v.stock)) || !(v.category === null || typeof v.category === "string") || ids.has(v.cloverItemId)) throw new FeedError("Invalid catalogue item.");
    ids.add(v.cloverItemId);
    return { cloverItemId: v.cloverItemId, name: v.name, priceCents: v.priceCents as number, category: v.category as string | null, tracked: v.tracked, stock: v.stock as number | null };
  });
}
export function parseSales(raw: unknown, requestedDate: string): SalesFeed {
  if (!object(raw) || raw.date !== dateKey(requestedDate) || raw.timezone !== "America/New_York" || typeof raw.complete !== "boolean" || typeof raw.generatedAt !== "string" || !Number.isFinite(Date.parse(raw.generatedAt)) || !Array.isArray(raw.items) || raw.items.length > 10000) throw new FeedError("Invalid daily sales response.");
  const ids = new Set<string>();
  const pickupAware = raw.onlinePickups !== undefined || raw.items.some(v => object(v) && (v.unitsOnlineSameDay !== undefined || v.unitsOnlineOtherDay !== undefined || v.hourlyInStore !== undefined));
  if (pickupAware && (!Array.isArray(raw.onlinePickups) || raw.onlinePickups.length > 10000)) throw new FeedError("Incomplete pickup-aware feed.");
  for (const v of raw.items) {
    if (!object(v) || !(v.cloverItemId === null || text(v.cloverItemId)) || !text(v.name) || (v.cloverItemId !== null && ids.has(v.cloverItemId)) || !numeric(v.unitsInStore) || !numeric(v.unitsOnline) || !numeric(v.unitsTotal) || Math.abs(v.unitsInStore + v.unitsOnline - v.unitsTotal) > 0.00001 || !Number.isSafeInteger(v.revenueCents) || !time(v.firstSaleAt) || !time(v.lastSaleAt) || !(v.stockEnd === null || (numeric(v.stockEnd) && Number.isSafeInteger(v.stockEnd))) || !object(v.hourly) || Object.entries(v.hourly).some(([h, n]) => !/^(?:[0-9]|1[0-9]|2[0-3])$/.test(h) || !numeric(n))) throw new FeedError("Invalid daily sales item.");
    if (v.cloverItemId !== null) ids.add(v.cloverItemId);
    if (pickupAware && (!numeric(v.unitsOnlineSameDay) || !numeric(v.unitsOnlineOtherDay) || Math.abs(v.unitsOnlineSameDay + v.unitsOnlineOtherDay - Number(v.unitsOnline)) > 0.00001 || !hourly(v.hourlyInStore))) throw new FeedError("Invalid same-day sales split.");
  }
  const source = raw as unknown as SalesFeed;
  const result: SalesFeed = { date: source.date, timezone: "America/New_York", generatedAt: source.generatedAt, complete: source.complete,
    items: source.items.map(item => ({ cloverItemId: item.cloverItemId, name: item.name, unitsInStore: item.unitsInStore, unitsOnline: item.unitsOnline, unitsTotal: item.unitsTotal, revenueCents: item.revenueCents, firstSaleAt: item.firstSaleAt, lastSaleAt: item.lastSaleAt, hourly: { ...item.hourly }, stockEnd: item.stockEnd, ...(numeric(item.refundedUnits) && item.refundedUnits >= 0 ? { refundedUnits: item.refundedUnits } : {}), ...(pickupAware ? { unitsOnlineSameDay: item.unitsOnlineSameDay!, unitsOnlineOtherDay: item.unitsOnlineOtherDay!, hourlyInStore: { ...item.hourlyInStore! } } : {}) })) };
  if (pickupAware) {
    const keys = new Set<string>();
    result.onlinePickups = (raw.onlinePickups as unknown[]).map(v => {
      if (!object(v) || !text(v.orderId) || !text(v.name) || !(v.cloverItemId === null || text(v.cloverItemId)) || !numeric(v.units) || v.units <= 0 || !time(v.pickupTime) || !(v.event === null || v.event === "thanksgiving") || typeof v.pickupDate !== "string") throw new FeedError("Invalid pickup obligation.");
      let pickupDate: string; try { pickupDate = dateKey(v.pickupDate); } catch { throw new FeedError("Invalid pickup date."); }
      const key = JSON.stringify([v.orderId, v.cloverItemId ?? v.name]);
      if (pickupDate === requestedDate || keys.has(key)) throw new FeedError("Duplicate or same-day pickup obligation.");
      keys.add(key);
      return { orderId: v.orderId, pickupDate, pickupTime: v.pickupTime as string | null, cloverItemId: v.cloverItemId as string | null, name: v.name, units: v.units, event: v.event as OnlinePickup["event"] };
    });
  }
  if (Number.isSafeInteger(raw.orders) && Number(raw.orders) >= 0) result.orders = Number(raw.orders);
  if (Number.isSafeInteger(raw.paidOrders) && Number(raw.paidOrders) >= 0) result.paidOrders = Number(raw.paidOrders);
  return result;
}
export interface FeedSource { items(): Promise<CatalogItem[]>; sales(date: string): Promise<SalesFeed> }
export class WebsiteFeed implements FeedSource {
  constructor(private secret: string, private request: typeof fetch = fetch) {
    if (!secret) throw new FeedError("Website feed is not configured.");
  }
  private async get(path: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.request(FEED_ORIGIN + path, { method: "GET", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30000), headers: { "x-edelweiss-signature": feedSignature(this.secret, path), Accept: "application/json" } });
        if (response.status >= 500 && attempt === 0) continue;
        if (response.status === 422) {
          const body: unknown = await response.json();
          if (object(body) && body.error === "outside_clover_window" && typeof body.oldestAvailable === "string") throw new FeedWindowError(dateKey(body.oldestAvailable));
        }
        if (!response.ok) throw new FeedError(`Website feed returned HTTP ${response.status}.`);
        const raw = await response.text();
        if (raw.length > 4_000_000) throw new FeedError("Website feed response is too large.");
        return JSON.parse(raw) as unknown;
      } catch (error) {
        if (error instanceof FeedError) throw error;
        if (attempt === 1) throw new FeedError("Website feed could not be reached or returned invalid JSON.");
      }
    }
    throw new FeedError("Website feed is unavailable.");
  }
  async items() { return parseCatalog(await this.get("/api/internal/items")); }
  async sales(date: string) { const day = dateKey(date), feed = parseSales(await this.get(`/api/internal/sales-daily?date=${day}`), day); if (!isPickupAwareFeed(feed)) throw new FeedError("Pickup-aware feed v1.2 is required; the previous capture was preserved."); return feed; }
}
