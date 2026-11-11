import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { WebsiteFeed } from "../src/lib/stock/feed";
import { StockService, type Connection, type Row } from "../src/lib/stock/service";
import { loadStockSeed } from "../src/lib/stock/seed";
import type { CatalogItem, SalesFeed } from "../src/lib/stock/types";

test("daily products cannot acquire Thanksgiving or explicitly labelled preorder items", async () => {
  const pg = new PGlite();
  const connection = (client: Pick<PGlite, "query">): Connection => ({ query: async <T extends Row>(sql: string, values: unknown[] = []) => (await client.query<T>(sql, values)).rows });
  const service = new StockService({ ...connection(pg), transaction: fn => pg.transaction(tx => fn(connection(tx))) });
  try {
    const seed = loadStockSeed(); await service.migrate(seed);
    const item = (cloverItemId: string, name: string): CatalogItem => ({ cloverItemId, name, priceCents: 400, category: "Bakery", tracked: true, stock: 0 });
    const holiday = item("holiday", "Thanksgiving Croissant");
    await service.saveCatalog([holiday, item("preorder", "Christmas pre-order croissant"), item("daily", "Seasonal Quiche")]);
    for (const product of seed) {
      const [current] = (await pg.query<{version: number}>("select version from plan_products where product_key=$1", [product.key])).rows;
      await assert.rejects(() => service.saveProduct({ productKey: product.key, version: current.version, pars: product.pars, actor: "Validation", cloverItemId: "holiday", confirmMapping: true }), /preorder|Thanksgiving/i);
    }
    const plain = seed.find(p => p.key === "plain")!;
    await assert.rejects(() => service.saveProduct({ productKey: plain.key, version: 1, pars: plain.pars, actor: "Validation", cloverItemId: "preorder" }), /preorder/i);
    assert.equal((await pg.query("select * from stock_audit")).rows.length, 0, "rejected links must not change products or audit");
    // An exact name alone must not bypass the exclusion during catalogue sync.
    await pg.query("update plan_products set display_name='Thanksgiving Croissant' where product_key='plain'");
    await service.saveCatalog([holiday]);
    assert.equal((await pg.query<{clover_item_id: string | null}>("select clover_item_id from plan_products where product_key='plain'")).rows[0].clover_item_id, null);
    // A stale/legacy link or later Clover rename must not materialize holiday payments as daily demand.
    await pg.query("update plan_products set clover_item_id='holiday' where product_key='plain'");
    const feed: SalesFeed = { date: "2026-11-06", timezone: "America/New_York", complete: true, generatedAt: "2026-11-07T07:30:00Z", items: [{ ...holiday, unitsInStore: 0, unitsOnline: 5, unitsTotal: 5, revenueCents: 2000, firstSaleAt: "09:00", lastSaleAt: "09:00", hourly: { "9": 5 }, stockEnd: 0 }] };
    await service.saveSnapshot(feed);
    assert.equal((await pg.query("select * from daily_sales")).rows.length, 0);
    assert.equal((await pg.query<{payload: SalesFeed}>("select payload from stock_feed_days")).rows[0].payload.items[0].unitsTotal, 5, "original payments stay in raw captures");
    // Everyday seasonal products are valid: Seasonal Quiche is not a holiday preorder.
    const quiche = seed.find(p => p.key === "quiche")!;
    await service.saveProduct({ productKey: quiche.key, version: 2, pars: quiche.pars, actor: "Validation", cloverItemId: "daily" });
  } finally { await pg.close(); }
});

test("both feed endpoints allow a 12-second Clover response and expire attempts at 30 seconds", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const controllers: AbortController[] = [];
  const deadlines: number[] = [];
  t.mock.method(AbortSignal, "timeout", (ms: number) => {
    const controller = new AbortController(); controllers.push(controller); deadlines.push(ms);
    setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), ms);
    return controller.signal;
  });
  const feed = new WebsiteFeed("test-only-secret", async (_url, options) => {
    await new Promise<void>((resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
      setTimeout(resolve, 12000);
    });
    return Response.json(String(_url).includes("sales-daily") ? { date: "2026-11-06", timezone: "America/New_York", complete: true, generatedAt: "2026-11-07T07:30:00Z", items: [] } : { items: [] });
  });
  for (const request of [() => feed.items(), () => feed.sales("2026-11-06")]) {
    const pending = request();
    t.mock.timers.tick(12000);
    await pending;
    assert.equal(controllers.at(-1)!.signal.aborted, false);
  }
  assert.deepEqual(deadlines, [30000, 30000]);
  const last = controllers.at(-1)!;
  t.mock.timers.tick(17999); assert.equal(last.signal.aborted, false);
  t.mock.timers.tick(1); assert.equal(last.signal.aborted, true);
});
