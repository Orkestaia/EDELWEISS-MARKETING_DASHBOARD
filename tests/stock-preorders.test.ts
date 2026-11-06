import { test } from "node:test";
import assert from "node:assert/strict";
import Papa from "papaparse";
import { fetchStockPreorders, parseStockPreorders } from "../src/lib/stock/preorders";
import type { CatalogItem } from "../src/lib/stock/types";

const products = [
  { key: "plain", name: "Plain Croissant", cloverItemId: "plain-id" },
  { key: "brioche", name: "Brioche with Chocolate, Orange and Hazelnut", cloverItemId: "brioche-id" },
  { key: "cafe", name: "Café", cloverItemId: null },
];
const catalog: CatalogItem[] = [{ cloverItemId: "plain-id", name: "Butter Croissant", priceCents: 400, category: null, tracked: true, stock: null }];
const date = "2026-11-09";
const order = (changes: Record<string, string> = {}) => ({ order_id: "one", pickup_date: date, items: "2x Plain Croissant ($4.00)", is_likely_test: "false", clover_state: "locked", notes: "", ...changes });
const csv = (...rows: ReturnType<typeof order>[]) => Papa.unparse(rows);

test("confirmed preorders sum repeated line items, exact catalogue aliases and names containing commas", () => {
  const result = parseStockPreorders(csv(order({ items: "2x Butter Croissant ($4.00), 3x Plain Croissant ($4.00), 1x Brioche with Chocolate, Orange and Hazelnut ($5.50)" })), date, products, catalog);
  assert.deepEqual(result.quantities, { plain: 5, brioche: 1 });
  assert.equal(result.status.available, true);
  assert.equal(result.status.unmapped, 0);
});

test("pickup dates and confirmed states are normalized, and only the requested business date is counted", () => {
  const result = parseStockPreorders(csv(...["locked", "paid", "confirmed", "completed", "closed"].map((state, i) => order({ order_id: String(i), pickup_date: "November 9, 2026", clover_state: state })), order({ order_id: "other-day", pickup_date: "2026-11-10" })), date, products, catalog);
  assert.deepEqual(result.quantities, { plain: 10 });
  assert.equal(result.status.available, true);
});

test("explicit weekday-prefixed pickup dates are validated, count on their day and never block later dates", () => {
  const text = csv(order({ order_id: "past-one", pickup_date: "THURSDAY · September 3, 2026" }), order({ order_id: "past-two", pickup_date: "Thursday, September 3, 2026" }), order({ order_id: "past-three", pickup_date: "thursday · September 3, 2026" }));
  const later = parseStockPreorders(text, "2026-11-06", products, catalog);
  assert.equal(later.status.available, true);
  assert.deepEqual(later.quantities, {});
  const sameDay = parseStockPreorders(text, "2026-09-03", products, catalog);
  assert.equal(sameDay.status.available, true);
  assert.deepEqual(sameDay.quantities, { plain: 6 });
  const wrongWeekday = parseStockPreorders(csv(order({ pickup_date: "FRIDAY · September 3, 2026" })), "2026-09-03", products, catalog);
  assert.equal(wrongWeekday.status.available, false);
  assert.equal(wrongWeekday.status.unmapped, 1);
  assert.deepEqual(wrongWeekday.quantities, {});
});

test("duplicate orders select the more complete record once without adding duplicate quantities", () => {
  const result = parseStockPreorders(csv(order({ items: "" }), order(), order(), order({ order_id: "two", items: "1x Plain Croissant ($4), 1x Plain Croissant ($4)" })), date, products, catalog);
  assert.deepEqual(result.quantities, { plain: 4 });
  assert.equal(result.status.available, true);
});

test("incompatible equally complete duplicates need review rather than arbitrary production", () => {
  const result = parseStockPreorders(csv(order(), order({ items: "9x Plain Croissant ($4.00)" })), date, products, catalog);
  assert.deepEqual(result.quantities, {});
  assert.equal(result.status.available, false);
  assert.equal(result.status.unmapped, 1);
});

test("relevant open and missing states cannot masquerade as confirmed zero preorders", () => {
  for (const state of ["open", "", "pending"]) {
    const result = parseStockPreorders(csv(order({ clover_state: state })), date, products, catalog);
    assert.deepEqual(result.quantities, {});
    assert.equal(result.status.available, false);
    assert.equal(result.status.unmapped, 1);
  }
});

test("tests and cancelled, refunded or failed orders are excluded, including cancelled duplicate records", () => {
  const result = parseStockPreorders(csv(order({ order_id: "test", is_likely_test: "TRUE" }), order({ order_id: "note", notes: "TEST - DO NOT PREPARE" }), order({ order_id: "cancel", clover_state: "cancelled" }), order({ order_id: "refund", clover_state: "refunded" }), order({ order_id: "fail", clover_state: "failed" }), order(), order({ clover_state: "cancelled" })), date, products, catalog);
  assert.deepEqual(result.quantities, {});
  assert.equal(result.status.available, true);
});

test("product names use exact Unicode-normalized case-insensitive matches; ambiguous or fuzzy names are flagged", () => {
  const normalized = parseStockPreorders(csv(order({ items: "1x CAFE\u0301 ($4)" })), date, products, catalog);
  assert.deepEqual(normalized.quantities, { cafe: 1 });
  const ambiguous = parseStockPreorders(csv(order()), date, [...products, { key: "another", name: "PLAIN CROISSANT", cloverItemId: null }], catalog);
  assert.deepEqual(ambiguous.quantities, {});
  assert.equal(ambiguous.status.unmapped, 1);
  const fuzzy = parseStockPreorders(csv(order({ items: "1x Plain Croissants ($4)" })), date, products, catalog);
  assert.deepEqual(fuzzy.quantities, {});
  assert.equal(fuzzy.status.unmapped, 1);
});

test("malformed items, dates and missing identifiers require review, never inferred quantities", () => {
  const cases: Record<string, string>[] = [{ items: "0x Plain Croissant ($4)" }, { items: "1.5x Plain Croissant ($4)" }, { items: "2x Plain Croissant ($4), unparsed leftovers" }, { pickup_date: "November 31, 2026" }, { order_id: "" }];
  for (const changes of cases) {
    const result = parseStockPreorders(csv(order(changes)), date, products, catalog);
    assert.deepEqual(result.quantities, {});
    assert.equal(result.status.available, false);
    assert.ok(result.status.unmapped > 0);
  }
});

test("the total download deadline aborts a nonresponsive request and cancels a stalled stream", async () => {
  let stalledSignal: AbortSignal | null | undefined;
  let streamCancelled = false;
  const [requestResult, streamResult] = await Promise.all([
    fetchStockPreorders(date, products, catalog, async (_url, init) => { stalledSignal = init?.signal; return new Promise<Response>(() => {}); }),
    fetchStockPreorders(date, products, catalog, async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("order_id,")); }, cancel() { streamCancelled = true; } }))),
  ]);
  assert.equal(requestResult.status.available, false);
  assert.equal(streamResult.status.available, false);
  assert.equal(stalledSignal?.aborted, true);
  assert.equal(streamCancelled, true);
});

test("invalid or incomplete CSV headers and oversized input fail as unavailable, while header-only CSV confirms no orders", () => {
  for (const text of ["", "order_id,pickup_date,items\none,2026-11-09,2x Plain Croissant ($4)", "<html>Sign in</html>", "a".repeat(2 * 1024 * 1024 + 1)]) {
    const result = parseStockPreorders(text, date, products, catalog);
    assert.equal(result.status.available, false);
    assert.deepEqual(result.quantities, {});
  }
  const empty = parseStockPreorders("order_id,pickup_date,items,is_likely_test,clover_state\n", date, products, catalog);
  assert.equal(empty.status.available, true);
  assert.deepEqual(empty.quantities, {});
});

test("results never expose personal fields, order IDs, raw records or parser errors", () => {
  const text = Papa.unparse([{ ...order({ order_id: "PRIVATE-ID", items: "unmapped PERSONAL-ITEM", notes: "PRIVATE-NOTES" }), customer_name: "PRIVATE-NAME", customer_email: "PRIVATE-EMAIL", customer_phone: "PRIVATE-PHONE" }]);
  const result = parseStockPreorders(text, date, products, catalog);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE-|PERSONAL-ITEM|order_id|customer_/);
  assert.deepEqual(Object.keys(result).sort(), ["quantities", "status"]);
});

test("fetch uses the fixed feed without credentials, automatic redirects or caching", async () => {
  let calls = 0;
  const request: typeof fetch = async (url, init) => {
    calls++;
    assert.match(String(url), /^https:\/\/docs\.google\.com\/spreadsheets\/d\/1Y0U5fpS8AnCU0iiQELSVyBxCHYbxMNrbeiJmaF4V77I\/export\?format=csv&gid=27254474$/);
    assert.equal(init?.redirect, "manual"); assert.equal(init?.credentials, "omit"); assert.equal(init?.cache, "no-store");
    assert.ok(init?.signal); assert.equal(new Headers(init?.headers).has("Authorization"), false); assert.equal(new Headers(init?.headers).has("Cookie"), false);
    return new Response(csv(order()));
  };
  const result = await fetchStockPreorders(date, products, catalog, request);
  assert.deepEqual(result.quantities, { plain: 2 }); assert.equal(calls, 1);
});

test("fetch follows approved Google export redirects and blocks all other hosts, credentials and protocols", async () => {
  for (const destination of ["https://accounts.google.com/signin", "https://evil.test/feed", "https://googleusercontent.com.evil.test/file", "https://googleusercontent.com/file", "http://docs.google.com/file", "https://user:pass@docs.google.com/file", "https://docs.google.com:444/file"]) {
    let calls = 0;
    const result = await fetchStockPreorders(date, products, catalog, async () => { calls++; return new Response(null, { status: 302, headers: { Location: destination } }); });
    assert.equal(result.status.available, false); assert.equal(calls, 1);
  }
  let calls = 0;
  const allowed = await fetchStockPreorders(date, products, catalog, async () => ++calls === 1 ? new Response(null, { status: 302, headers: { Location: "https://doc-xyz.googleusercontent.com/export.csv" } }) : new Response(csv(order())));
  assert.equal(allowed.status.available, true); assert.equal(calls, 2);
});

test("redirect loops, failed responses, fetch failures and oversized streamed bodies return generic unavailable states", async () => {
  let calls = 0;
  const loop = await fetchStockPreorders(date, products, catalog, async () => { calls++; return new Response(null, { status: 302, headers: { Location: "https://docs.google.com/again" } }); });
  assert.equal(loop.status.available, false); assert.equal(calls, 4);
  const cases: (typeof fetch)[] = [async () => new Response("PRIVATE-FAILURE", { status: 502 }), async () => { throw new Error("PRIVATE-FAILURE"); }, async () => new Response("", { headers: { "Content-Length": String(2 * 1024 * 1024 + 1) } }), async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); controller.enqueue(new Uint8Array(1024 * 1024 + 1)); controller.close(); } }))];
  for (const request of cases) {
    const result = await fetchStockPreorders(date, products, catalog, request);
    assert.equal(result.status.available, false); assert.deepEqual(result.quantities, {});
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE-/);
  }
});
