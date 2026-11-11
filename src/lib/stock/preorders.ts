import Papa from "papaparse";
import type { CatalogItem, OnlinePickup } from "./types";
import type { PickupContext } from "./pickup-context";

export interface StockPreorderProduct { key: string; name: string; cloverItemId: string | null }
export interface StockPreordersResult {
  quantities: Record<string, number>;
  status: { available: boolean; message: string; unmapped: number };
}

const FEED_URL = "https://docs.google.com/spreadsheets/d/1Y0U5fpS8AnCU0iiQELSVyBxCHYbxMNrbeiJmaF4V77I/export?format=csv&gid=27254474";
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 8000;
const CONFIRMED = new Set(["locked", "paid", "confirmed", "completed", "closed"]);
const CANCELLED = new Set(["cancelled", "canceled", "refunded", "failed", "void", "voided", "declined"]);
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const unavailable = (): StockPreordersResult => ({ quantities: {}, status: { available: false, message: "Preorders could not be verified. Review orders before planning.", unmapped: 0 } });
const normalizedName = (value: string) => value.trim().normalize("NFC").toLocaleLowerCase("en-US");

function pickupDate(value: string): string | null {
  let text = value.trim();
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const prefix = /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s*(?:·|,)\s*(.+)$/i.exec(text);
  if (prefix) text = prefix[2].trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const match = /^([a-z]+)\s+(\d{1,2}),\s*(\d{4})$/i.exec(text);
    if (!match) return null;
    const month = MONTHS.indexOf(match[1].toLowerCase());
    if (month < 0) return null;
    text = `${match[3]}-${String(month + 1).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  }
  const parsed = new Date(`${text}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text &&
    (!prefix || parsed.getUTCDay() === weekdays.indexOf(prefix[1].toLowerCase())) ? text : null;
}

interface LineItem { name: string; quantity: number }
function lineItems(value: string): LineItem[] | null {
  const text = value.trim();
  if (!text) return null;
  // Match the price terminator, rather than splitting on commas inside names.
  const item = /([1-9]\d*)\s*x\s+(.+?)\s*\(\$((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)\)\s*(,\s*|$)/gy;
  const result: LineItem[] = [];
  let consumed = 0;
  while (consumed < text.length) {
    item.lastIndex = consumed;
    const match = item.exec(text);
    if (!match || !Number.isSafeInteger(Number(match[1])) || !match[2].trim()) return null;
    consumed = item.lastIndex;
    if (match[4] && consumed === text.length) return null;
    result.push({ name: normalizedName(match[2]), quantity: Number(match[1]) });
  }
  return result.length ? result : null;
}

interface Candidate {
  pickup: string | null; state: string; lines: LineItem[] | null; excluded: boolean; score: number; signature: string;
}

/** Pure extraction: no customer fields, order IDs or source records escape this boundary. */
export function parseStockPreorders(csv: string, date: string, products: readonly StockPreorderProduct[], catalog: readonly CatalogItem[], feed?: PickupContext): StockPreordersResult {
  try {
    if (feed && !feed.complete) return { quantities: {}, status: { available: false, message: "Pickup-aware sales history is still syncing. Review orders before accepting a recommendation.", unmapped: 0 } };
    if (pickupDate(date) !== date || csv.length > MAX_BYTES || new TextEncoder().encode(csv).byteLength > MAX_BYTES) return unavailable();
    const parsed = Papa.parse<string[]>(csv, { skipEmptyLines: "greedy", delimiter: "," });
    if (parsed.errors.length || !parsed.data.length) return unavailable();
    const header = parsed.data[0].map(value => value.trim().replace(/^\uFEFF/, "").toLowerCase());
    const required = ["order_id", "pickup_date", "items", "is_likely_test", "clover_state"];
    if (new Set(header).size !== header.length || required.some(value => !header.includes(value))) return unavailable();
    if (parsed.data.slice(1).some(row => row.length !== header.length)) return unavailable();
    const index = new Map(header.map((value, i) => [value, i]));
    const field = (row: string[], key: string) => row[index.get(key) ?? -1]?.trim() ?? "";
    const names = new Map<string, Set<string>>();
    const addName = (name: string, key: string) => {
      const normalized = normalizedName(name);
      if (!normalized) return;
      const keys = names.get(normalized) ?? new Set<string>(); keys.add(key); names.set(normalized, keys);
    };
    for (const product of products) {
      addName(product.name, product.key);
      if (product.cloverItemId) for (const item of catalog) if (item.cloverItemId === product.cloverItemId) addName(item.name, product.key);
    }
    // IDs are used only transiently to avoid double-counting; they are never
    // returned, logged, stored or used in a diagnostic message.
    const orders = new Map<string, Candidate[]>();
    let unmapped = 0;
    for (const row of parsed.data.slice(1)) {
      const id = field(row, "order_id");
      const pickup = pickupDate(field(row, "pickup_date"));
      const state = field(row, "clover_state").toLowerCase();
      const test = /^(true|1|yes)$/i.test(field(row, "is_likely_test")) || /TEST\s*[-–—:]?\s*DO\s+NOT\s+PREPARE|TEST.*NO PREPARAR/i.test(field(row, "notes"));
      const excluded = test || CANCELLED.has(state);
      const lines = lineItems(field(row, "items"));
      if (!id) { if (!excluded && (pickup === date || !pickup)) unmapped++; continue; }
      const signature = JSON.stringify([pickup, CONFIRMED.has(state) ? "confirmed" : state, lines?.map(line => [line.name, line.quantity]).sort()]);
      const candidate: Candidate = { pickup, state, lines, excluded, signature,
        score: (pickup ? 16 : 0) + (CONFIRMED.has(state) ? 8 : 0) + (lines ? 16 + Math.min(lines.length, 4) : 0) };
      const records = orders.get(id) ?? []; records.push(candidate); orders.set(id, records);
    }
    const quantities = new Map<string, number>();
    const feedOrders = new Map<string, Map<string, OnlinePickup>>();
    const conflicts = new Set<string>();
    for (const line of feed?.pickups ?? []) {
      const lines = feedOrders.get(line.orderId) ?? new Map();
      const key = line.cloverItemId ?? normalizedName(line.name), previous = lines.get(key);
      if ((previous && JSON.stringify(previous) !== JSON.stringify(line)) || [...lines.values()].some(other => other.pickupDate !== line.pickupDate)) conflicts.add(line.orderId);
      lines.set(key, line); feedOrders.set(line.orderId, lines);
    }
    for (const [id, lines] of feedOrders) {
      if (![...lines.values()].some(line => line.pickupDate === date)) continue;
      if (conflicts.has(id) || orders.get(id)?.some(row => row.excluded)) { unmapped++; continue; }
      for (const line of lines.values()) {
        const idKeys = products.filter(p => line.cloverItemId !== null && p.cloverItemId === line.cloverItemId).map(p => p.key);
        const keys = idKeys.length ? new Set(idKeys) : names.get(normalizedName(line.name));
        if (!keys || keys.size !== 1 || !Number.isSafeInteger(line.units) || line.units <= 0) { unmapped++; continue; }
        const key = keys.values().next().value as string, count = (quantities.get(key) ?? 0) + line.units;
        if (!Number.isSafeInteger(count)) return unavailable();
        quantities.set(key, count);
      }
    }
    const coveredIds = new Set([...(feed?.coveredOrderIds ?? []), ...feedOrders.keys()]);
    for (const [id, records] of orders) {
      // Feed order IDs are authoritative, including a pickup moved to another day.
      // Keep every feed item; skip the entire matching Sheet order, not just one line.
      if (coveredIds.has(id)) continue;
      // Cancellation/test evidence wins over earlier duplicate sale records.
      if (records.some(record => record.excluded)) continue;
      const bestScore = Math.max(...records.map(record => record.score));
      const best = records.filter(record => record.score === bestScore);
      if (new Set(best.map(record => record.signature)).size > 1) {
        if (records.some(record => !record.pickup || record.pickup === date)) unmapped++;
        continue;
      }
      const record = best[0];
      if (record.pickup && record.pickup !== date) continue;
      if (!record.pickup || !CONFIRMED.has(record.state) || !record.lines) { unmapped++; continue; }
      for (const line of record.lines) {
        const keys = names.get(line.name);
        if (!keys || keys.size !== 1) { unmapped++; continue; }
        const key = keys.values().next().value as string;
        const count = (quantities.get(key) ?? 0) + line.quantity;
        if (!Number.isSafeInteger(count)) return unavailable();
        quantities.set(key, count);
      }
    }
    return { quantities: Object.fromEntries(quantities), status: { available: unmapped === 0,
      message: unmapped ? "Some preorder records need review before they can be included." : "Preorders checked for this pickup date.", unmapped } };
  } catch { return unavailable(); }
}

function allowedUrl(value: string, base?: string): URL {
  const url = new URL(value, base);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
    (url.hostname !== "docs.google.com" && !(url.hostname.endsWith(".googleusercontent.com") && url.hostname !== "googleusercontent.com"))) {
    throw new Error("Unapproved export location");
  }
  url.hash = "";
  return url;
}

async function boundedText(response: Response, signal: AbortSignal): Promise<string> {
  const length = response.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) {
    void response.body?.cancel().catch(() => {}); throw new Error("Export too large");
  }
  if (!response.body) throw new Error("Missing export body");
  const reader = response.body.getReader();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      if (signal.aborted) throw new Error("Export timed out");
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { void reader.cancel().catch(() => {}); throw new Error("Export too large"); }
      chunks.push(value);
    }
    if (signal.aborted) throw new Error("Export timed out");
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } finally { signal.removeEventListener("abort", abort); reader.releaseLock(); }
}

/** Server-side bounded download of the single approved orders export. */
export async function fetchStockPreorders(date: string, products: readonly StockPreorderProduct[], catalog: readonly CatalogItem[], request: typeof fetch = fetch, feed?: PickupContext): Promise<StockPreordersResult> {
  if (pickupDate(date) !== date) return unavailable();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Export timed out")); }, TIMEOUT_MS); });
  try {
    const download = async (): Promise<StockPreordersResult> => {
      let url = allowedUrl(FEED_URL);
      for (let redirects = 0; redirects <= 3; redirects++) {
        if (controller.signal.aborted) throw new Error("Export timed out");
        const response = await request(url.href, { cache: "no-store", redirect: "manual", credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal, headers: { Accept: "text/csv" } });
        if (response.redirected) { void response.body?.cancel().catch(() => {}); throw new Error("Unexpected automatic redirect"); }
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          void response.body?.cancel().catch(() => {});
          const location = response.headers.get("location");
          if (!location || redirects === 3) throw new Error("Export redirect unavailable");
          url = allowedUrl(location, url.href); continue;
        }
        if (!response.ok) { void response.body?.cancel().catch(() => {}); throw new Error("Export unavailable"); }
        return parseStockPreorders(await boundedText(response, controller.signal), date, products, catalog, feed);
      }
      return unavailable();
    };
    return await Promise.race([download(), timeout]);
  } catch { return unavailable(); }
  finally { if (timer !== undefined) clearTimeout(timer); controller.abort(); }
}
