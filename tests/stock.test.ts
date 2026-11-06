import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { StockService, type Connection, type Row } from "../src/lib/stock/service";
import { dateKey, maineDate, monday, nightlyDue, shiftDate, validateClose } from "../src/lib/stock/domain";
import { FeedError, FeedWindowError, feedSignature, parseSales, WebsiteFeed } from "../src/lib/stock/feed";
import { loadStockSeed } from "../src/lib/stock/seed";
import { syncStock } from "../src/lib/stock/sync";
import type { CatalogItem, SalesFeed } from "../src/lib/stock/types";

export const catalog: CatalogItem[] = [
  { cloverItemId: "plain-id", name: "Plain Croissant", priceCents: 400, category: "Bakery", tracked: true, stock: 12 },
  { cloverItemId: "berliner-id", name: "Berliner", priceCents: 400, category: "Bakery", tracked: true, stock: 5 },
  { cloverItemId: "kuchen-id", name: "Seasonal Vanilla Kuchen", priceCents: 500, category: "Bakery", tracked: true, stock: 6 },
];
const sales = (date: string, complete = true): SalesFeed => ({ date, timezone: "America/New_York", generatedAt: `${shiftDate(date, 1)}T07:30:00Z`, complete, items: [{ cloverItemId: "plain-id", name: "Plain Croissant", unitsInStore: 9, unitsOnline: 2, unitsTotal: 11, revenueCents: 4400, firstSaleAt: "07:12", lastSaleAt: "11:48", hourly: { "7": 1, "8": 3, "9": 4, "10": 2, "11": 1 }, stockEnd: 0 }] });
export async function stockFixture() {
  const pg = new PGlite();
  const connection = (client: Pick<PGlite, "query">): Connection => ({ query: async <T extends Row>(sql: string, params: unknown[] = []) => (await client.query<T>(sql, params)).rows });
  const service = new StockService({ ...connection(pg), transaction: fn => pg.transaction(tx => fn(connection(tx))) });
  await service.migrate(loadStockSeed());
  return { pg, service };
}
test("Maine business dates and nightly window survive midnight and DST", () => {
  assert.equal(maineDate(new Date("2026-10-29T02:00:00Z")), "2026-10-28");
  assert.equal(monday("2026-11-01"), "2026-10-26");
  assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
  assert.equal(dateKey("2028-02-29"), "2028-02-29");
  for (const bad of ["2026-02-29", "2026-04-31", "oops", "2026-2-01"]) assert.throws(() => dateKey(bad));
  assert.equal(nightlyDue(new Date("2026-07-01T06:30:00Z")), true);
  assert.equal(nightlyDue(new Date("2026-12-01T07:30:00Z")), true);
  assert.equal(nightlyDue(new Date("2026-03-08T06:30:00Z")), false);
  assert.equal(nightlyDue(new Date("2026-03-08T07:30:00Z")), true);
  assert.equal(nightlyDue(new Date("2026-11-01T06:30:00Z")), false);
  assert.equal(nightlyDue(new Date("2026-11-01T07:30:00Z")), true);
});
test("all 26 CSV products seed correctly, including quoted names, accents and pending mappings", () => {
  const seed = loadStockSeed(); assert.equal(seed.length, 26);
  assert.equal(seed.filter(p => p.mappingNote).length, 2);
  assert.equal(seed.find(p => p.key === "brioche")?.name, "Brioche with Chocolate, Orange and Hazelnut");
  assert.deepEqual(seed.find(p => p.key === "pac")?.pars, [12, 12, 12, 12, 16, 20, 20]);
});
test("feed signs exactly timestamp.method path.query.empty body; requests stay server-to-server", async () => {
  const path = "/api/internal/sales-daily?date=2026-10-28", timestamp = 1793242800;
  assert.equal(feedSignature("test-only-secret", path, timestamp * 1000), `t=${timestamp},v1=${createHmac("sha256", "test-only-secret").update(`${timestamp}.GET ${path}.`).digest("hex")}`);
  let calls = 0;
  const feed = new WebsiteFeed("test-only-secret", async (url, options) => {
    calls++; assert.equal(String(url), "https://www.edelweisspastryshop.ch" + path); assert.equal(options?.redirect, "error"); assert.equal(options?.cache, "no-store");
    assert.match((options?.headers as Record<string, string>)["x-edelweiss-signature"], /^t=\d+,v1=[a-f\d]{64}$/);
    return calls === 1 ? new Response("", { status: 503 }) : Response.json(sales("2026-10-28"));
  });
  assert.equal((await feed.sales("2026-10-28")).items[0].unitsTotal, 11); assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(() => new WebsiteFeed("secret", async () => { calls++; return new Response("", { status: 401 }); }).items(), /HTTP 401/);
  assert.equal(calls, 1);
  await assert.rejects(() => new WebsiteFeed("secret", async () => Response.json({ error: "outside_clover_window", oldestAvailable: "2026-08-01" }, { status: 422 })).sales("2026-07-31"), error => error instanceof FeedWindowError && error.oldestAvailable === "2026-08-01");
  assert.throws(() => parseSales({ ...sales("2026-10-28"), timezone: "Europe/Madrid" }, "2026-10-28"));
  const duplicate = sales("2026-10-28"); duplicate.items.push(duplicate.items[0]); assert.throws(() => parseSales(duplicate, duplicate.date));
  const deleted = sales("2026-10-28"); deleted.items[0].cloverItemId = null;
  assert.equal(parseSales(deleted, deleted.date).items[0].cloverItemId, null);
});
test("close validation preserves unknown counts, enforces allocations and actual confirmation", () => {
  const base = { baked: null, leftover: null, tgtg: 0, reused: 0, discarded: 0, soldOut: false, soldOutAt: null };
  assert.equal(validateClose(base, false).baked, null);
  assert.throws(() => validateClose(base, true), /Confirm actual/);
  assert.throws(() => validateClose({ ...base, baked: 10, leftover: 2, tgtg: 3 }, true), /cannot exceed leftovers/);
  assert.throws(() => validateClose({ ...base, baked: 10, leftover: 12 }, true), /cannot exceed the quantity baked/);
  assert.throws(() => validateClose({ ...base, baked: 10, leftover: 1, soldOut: true }, true), /still has leftovers/);
  assert.throws(() => validateClose({ ...base, baked: -1 }, false));
  assert.throws(() => validateClose({ ...base, baked: 1.5 }, false));
  assert.throws(() => validateClose({ ...base, soldOut: true, soldOutAt: "25:30" }, false));
  assert.equal(validateClose({ ...base, baked: 0, leftover: 0 }, true).baked, 0);
});
test("Postgres integration: seed, optimistic edits, audit, mappings, snapshots and durable close", async t => {
  const { pg, service } = await stockFixture();
  const now = new Date("2026-10-29T17:00:00Z");
  try {
    await t.test("seed is idempotent and never overwrites staff defaults", async () => {
      await service.migrate(loadStockSeed());
      let view = await service.view("2026-10-28", true, now); assert.equal(view.products.length, 26);
      const plain = view.products.find(p => p.key === "plain")!;
      await service.saveProduct({ productKey: plain.key, version: plain.version, pars: [15, 12, 12, 12, 16, 16, 16], actor: "Valentina", cloverItemId: null });
      await service.migrate(loadStockSeed()); view = await service.view("2026-10-28", true, now);
      assert.equal(view.products.find(p => p.key === "plain")!.pars[0], 15);
    });
    await t.test("snapshots preserve unmapped data and replay it on exact catalogue mapping", async () => {
      await service.saveSnapshot(sales("2026-10-28"));
      let view = await service.view("2026-10-28", true, now); assert.equal(view.sales.length, 0); assert.equal(view.snapshots[0].unmapped, 1);
      await service.saveCatalog(catalog); view = await service.view("2026-10-28", true, now);
      assert.equal(view.sales[0].units, 11); assert.equal(view.snapshots[0].unmapped, 0);
      assert.equal(view.products.find(p => p.key === "kuchen-tart")!.cloverItemId, null);
      assert.equal(await service.saveSnapshot(sales("2026-10-28")), true);
      assert.equal((await pg.query("select * from daily_sales")).rows.length, 1);
      assert.equal(await service.saveSnapshot({ ...sales("2026-10-28", false), generatedAt: "2026-10-29T09:00:00Z" }), false);
      assert.equal(await service.saveSnapshot({ ...sales("2026-10-28"), generatedAt: "2026-10-29T06:00:00Z" }), false);
      const corrected = sales("2026-10-28"); corrected.generatedAt = "2026-10-29T10:00:00Z"; corrected.items[0] = { ...corrected.items[0], unitsInStore: -0.5, unitsOnline: 0, unitsTotal: -0.5, revenueCents: -200 };
      await service.saveSnapshot(corrected);
      assert.equal((await service.view("2026-10-28", true, now)).sales[0].units, -0.5);
      const deleted = sales("2026-10-27"); deleted.items.push({ ...deleted.items[0], cloverItemId: null, name: "Retired item" });
      await service.saveSnapshot(deleted);
      assert.equal((await service.view("2026-10-28", true, now)).snapshots.find(s => s.date === deleted.date)?.unmapped, 1);
    });
    await t.test("manual plans enforce reasons, preserve baseline and reject concurrent edits", async () => {
      const body = { productKey: "plain", date: "2026-10-29", planned: 18, version: 0, actor: "Valentina" };
      await assert.rejects(() => service.savePlan(body), /reason/);
      const saved = await service.savePlan({ ...body, reason: "Extra tray" }); assert.equal(saved.baseline, 12);
      await assert.rejects(() => service.savePlan({ ...body, reason: "Other device" }), /Someone changed/);
      assert.equal((await service.view("2026-10-29", true, now)).plans[0].planned, 18);
      const audits = await pg.query("select * from stock_audit where entity='plan'"); assert.equal(audits.rows.length, 1);
    });
    await t.test("progress survives reload; final close and corrections retain audit and version", async () => {
      const body = { productKey: "plain", date: "2026-10-29", version: 0, actor: "Valentina", status: "draft", baked: 16, leftover: null, tgtg: 0, reused: 0, discarded: 0, soldOut: false, soldOutAt: null };
      const draft = await service.saveClose(body, now); assert.equal(draft.version, 1);
      let view = await service.view("2026-10-29", true, now); assert.equal(view.closes[0].leftover, null); assert.equal(view.closes[0].baked, 16);
      const closed = await service.saveClose({ ...body, status: "closed", leftover: 4, tgtg: 2, reused: 1, discarded: 1, version: 1 }, now); assert.equal(closed.status, "closed");
      await assert.rejects(() => service.saveClose({ ...body, version: 1 }, now), /Someone changed/);
      await assert.rejects(() => service.saveClose({ ...body, date: "2026-10-30" }, now), /today or an earlier/);
      view = await service.view("2026-10-29", true, now); assert.equal(view.closes[0].enteredBy, "Valentina");
      assert.equal((await pg.query("select * from stock_audit where entity='close'")).rows.length, 2);
    });
    await t.test("sync lock excludes concurrent pulls and releases only for its owner", async () => {
      const lock = await service.acquireSync(); assert.ok(lock);
      assert.equal(await service.acquireSync(), null);
      await service.releaseSync("wrong-owner"); assert.equal(await service.acquireSync(), null);
      await service.releaseSync(lock);
    });
    await t.test("backfill resumes after feed failure, stores the full window and is idempotent", async () => {
      let calls = 0;
      const broken = { items: async () => catalog, sales: async (date: string) => { if (++calls === 3) throw new FeedError("Temporary website outage."); return sales(date); } };
      assert.equal((await syncStock(service, broken, now)).status, "error");
      const result = await syncStock(service, { items: async () => catalog, sales: async (date: string) => sales(date) }, now);
      assert.equal(result.status, "ok");
      const view = await service.view("2026-10-28", true, now); assert.equal(view.snapshots.filter(s => s.complete).length, 90);
      const requested: string[] = [];
      const second = await syncStock(service, { items: async () => catalog, sales: async date => { requested.push(date); const refreshed = sales(date); refreshed.generatedAt = now.toISOString(); refreshed.items[0] = { ...refreshed.items[0], unitsInStore: 6, unitsTotal: 8 }; return refreshed; } }, now);
      assert.equal(second.stored, 7); assert.equal(second.status, "ok");
      assert.deepEqual(requested, Array.from({ length: 7 }, (_, i) => shiftDate("2026-10-29", -i - 1)));
      assert.equal((await service.view("2026-10-29", true, now)).sales.find(s => s.date === "2026-10-28")?.units, 8);
      assert.equal((await pg.query("select * from stock_feed_days")).rows.length, 90);
    });
    await t.test("out-of-window days remain missing, never fake zero captures", async () => {
      await pg.query("delete from stock_feed_days where date='2026-07-31'");
      const result = await syncStock(service, { items: async () => catalog, sales: async date => { if (date < "2026-08-01") throw new FeedWindowError("2026-08-01"); return sales(date); } }, now);
      assert.equal(result.status, "ok"); assert.match(result.message, /outside Clover/);
      assert.equal((await pg.query("select * from stock_feed_days where date='2026-07-31'")).rows.length, 0);
    });
  } finally { await pg.close(); }
});
