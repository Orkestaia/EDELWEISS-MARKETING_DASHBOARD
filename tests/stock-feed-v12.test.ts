import test from "node:test";
import assert from "node:assert/strict";
import Papa from "papaparse";
import { PGlite } from "@electric-sql/pglite";
import { parseSales, WebsiteFeed } from "../src/lib/stock/feed";
import { parseStockPreorders } from "../src/lib/stock/preorders";
import { pickupContext } from "../src/lib/stock/pickup-context";
import { StockService, type Connection, type Row } from "../src/lib/stock/service";
import { PlanningService } from "../src/lib/stock/planning-service";
import { calculatePlan } from "../src/lib/stock/planning";
import { loadStockSeed } from "../src/lib/stock/seed";
import { shiftDate } from "../src/lib/stock/domain";
import type { OnlinePickup, SalesFeed } from "../src/lib/stock/types";

const target = "2026-11-16";
const pickup = (orderId = "web", cloverItemId = "plain", units = 2): OnlinePickup => ({ orderId, pickupDate: target, pickupTime: "10:00", cloverItemId, name: cloverItemId === "plain" ? "Plain Croissant" : "Berliner", units, event: null });
const feed = (date = "2026-11-02"): SalesFeed => ({ date, timezone: "America/New_York", generatedAt: `${shiftDate(date, 1)}T08:00:00Z`, complete: true, onlinePickups: [pickup(date, "plain", 50)], items: [{ cloverItemId: "plain", name: "Plain Croissant", unitsInStore: 10, unitsOnline: 52, unitsOnlineSameDay: 2, unitsOnlineOtherDay: 50, unitsTotal: 62, revenueCents: 24800, hourly: { "8": 5, "12": 5, "21": 52 }, hourlyInStore: { "8": 5, "12": 5 }, firstSaleAt: "08:00", lastSaleAt: "21:00", stockEnd: null }] });
const products = [{ key: "plain", name: "Plain Croissant", cloverItemId: "plain" }, { key: "berliner", name: "Berliner", cloverItemId: "berliner" }];
const sheet = (...rows: {order_id: string; items: string; pickup_date?: string; clover_state?: string}[]) => Papa.unparse(rows.map(row => ({ pickup_date: target, clover_state: "paid", is_likely_test: "false", ...row })));

test("v1.2 validates complete splits, keeps allowlisted pickup metadata and rejects a partial downgrade", async () => {
  const raw = { ...feed(), customerEmail: "private@example.invalid", onlinePickups: [{ ...pickup(), customerName: "PRIVATE" }] };
  const parsed = parseSales(raw, raw.date);
  assert.equal(parsed.items[0].unitsOnlineOtherDay, 50);
  assert.equal(parsed.onlinePickups![0].orderId, "web");
  assert.doesNotMatch(JSON.stringify(parsed), /customer|PRIVATE|private@example/);
  for (const change of [{ unitsOnlineSameDay: undefined }, { unitsOnlineOtherDay: 40 }, { hourlyInStore: { "25": 2 } }]) {
    assert.throws(() => parseSales({ ...raw, items: [{ ...raw.items[0], ...change }] }, raw.date));
  }
  assert.throws(() => parseSales({ ...raw, onlinePickups: [pickup(), pickup()] }, raw.date));
  assert.throws(() => parseSales({ ...raw, onlinePickups: [{ ...pickup(), pickupDate: "2026-02-30" }] }, raw.date));
  const legacy = { ...feed(), onlinePickups: undefined, items: feed().items.map(({ unitsOnlineSameDay: _a, unitsOnlineOtherDay: _b, hourlyInStore: _c, ...item }) => { void _a; void _b; void _c; return item; }) };
  await assert.rejects(() => new WebsiteFeed("fixture", async () => Response.json(legacy)).sales(legacy.date), /v1.2/);
});

test("feed and Sheet union dedupes whole orders, preserves all products and equal legitimate orders", () => {
  const text = sheet({ order_id: "web", items: "99x Plain Croissant ($4)" }, { order_id: "phone", items: "3x Plain Croissant ($4)" }, { order_id: "moved", items: "99x Plain Croissant ($4)" });
  const pickups = [pickup(), pickup("web", "berliner", 1), pickup("web2"), { ...pickup("moved"), pickupDate: "2026-11-17" }];
  const result = parseStockPreorders(text, target, products, [], { complete: true, pickups: [...pickups, pickup()] });
  assert.deepEqual(result.quantities, { plain: 7, berliner: 1 });
  assert.equal(result.status.available, true);
  assert.doesNotMatch(JSON.stringify(result), /web2|orderId|order_id/);
});

test("missing coverage, conflicting sources and unknown campaign products cannot become verified zero", () => {
  assert.equal(parseStockPreorders(sheet(), target, products, [], { complete: false, pickups: [] }).status.available, false);
  const csv = sheet({ order_id: "web", items: "2x Plain Croissant ($4)" });
  const campaign = { ...pickup(), cloverItemId: "holiday", name: "Plain Croissant (Thanksgiving)", event: "thanksgiving" as const };
  assert.equal(parseStockPreorders(csv, target, products, [], { complete: true, pickups: [campaign] }).status.available, false);
  assert.equal(parseStockPreorders(csv, target, products, [], { complete: true, pickups: [pickup(), pickup("web", "plain", 9)] }).status.available, false);
});

test("90 complete pickup-aware dates are required and historical legacy captures remain pending", () => {
  const today = "2026-11-11";
  const days = Array.from({ length: 90 }, (_, i) => { const payload = feed(shiftDate(today, -i - 1)); return { date: payload.date, complete: true, payload, generatedAt: payload.generatedAt }; });
  assert.equal(pickupContext(days, today).complete, true);
  assert.equal(pickupContext(days.slice(1), today).complete, false);
  days[0].payload.onlinePickups = undefined;
  assert.equal(pickupContext(days, today).complete, false);
});

test("payment-day ledger is preserved; base is 10 counter + 2 same-day, and refunds cannot resurrect Sheet copies", async () => {
  const pg = new PGlite();
  const wrap = (c: Pick<PGlite, "query">): Connection => ({ query: async <T extends Row>(s: string, v: unknown[] = []) => (await c.query<T>(s, v)).rows });
  const db = { ...wrap(pg), transaction: <T>(fn: (tx: Connection) => Promise<T>) => pg.transaction(tx => fn(wrap(tx))) };
  const stock = new StockService(db);
  try {
    await stock.migrate(loadStockSeed());
    await stock.saveCatalog([{ cloverItemId: "plain", name: "Plain Croissant", priceCents: 400, tracked: true, stock: null, category: null }]);
    for (const date of ["2026-11-02", "2026-10-26", "2026-10-19"]) await stock.saveSnapshot(feed(date));
    const csv = sheet({ order_id: "2026-11-02", items: "50x Plain Croissant ($4)" }, { order_id: "phone", items: "1x Plain Croissant ($4)" });
    // This fixture isolates union/base behavior; complete-window gating is tested above.
    const service = new PlanningService(db, async (date, p, c, source) => parseStockPreorders(csv, date, p, c, { ...source!, complete: true }));
    await service.migrate();
    let plain = (await service.preview(target)).rows.find(row => row.productKey === "plain")!;
    assert.equal(plain.explain.base, 12); assert.equal(plain.suggested, 12); assert.equal(plain.preorders, 151);
    assert.equal((await pg.query<{ units: number }>("select (units_in_store+units_online)::float8 as units from daily_sales limit 1")).rows[0].units, 62);
    const original = feed(); await stock.saveSnapshot(original);
    assert.equal((await service.preview(target)).rows.find(row => row.productKey === "plain")!.preorders, 151, "replays replace, never append obligations");
    await stock.saveSnapshot({ ...original, generatedAt: "2026-11-12T08:00:00Z", onlinePickups: [], items: [{ ...original.items[0], unitsOnline: 2, unitsOnlineOtherDay: 0, unitsTotal: 12 }] });
    plain = (await service.preview(target)).rows.find(row => row.productKey === "plain")!;
    assert.equal(plain.preorders, 101, "the stale Sheet copy of the refunded feed order is still excluded");
    const legacy = { ...original, generatedAt: "2026-11-13T08:00:00Z", onlinePickups: undefined, items: original.items.map(({ unitsOnlineSameDay: _a, unitsOnlineOtherDay: _b, hourlyInStore: _c, ...item }) => { void _a; void _b; void _c; return item; }) };
    assert.equal(await stock.saveSnapshot(legacy), false, "a legacy response must not downgrade pickup-aware captures");
    assert.doesNotMatch(JSON.stringify(await service.preview(target)), /orderId|order_id|2026-11-02.*phone/);
    const racing = new PlanningService(db, async () => {
      await stock.saveSnapshot({ ...original, generatedAt: "2026-11-14T08:00:00Z" });
      return { quantities: { plain: 1 }, status: { available: true, message: "Fixture", unmapped: 0 } };
    });
    await assert.rejects(() => racing.apply({ date: target, productKey: "plain", version: 0, planned: 12, actor: "Validation", reason: "Review" }), /changed/);
    assert.equal((await pg.query("select * from plan_days")).rows.length, 0, "a concurrent feed refresh cannot save an obsolete recommendation");
  } finally { await pg.close(); }
});

test("counter-only hourly curves use counter denominators and do not inflate same-day online sales", () => {
  const dates = ["2026-11-09", "2026-11-02", "2026-10-26"];
  const result = calculatePlan({ date: target, product: { key: "plain", family: "laminated", pars: [1,1,1,1,1,1,1], unitsPerTray: 1, bufferK: 0, targetSelloutTime: "12:00" }, settings: { baseWeeks: 4, censorCap: 1.6, closingTime: "14:00" }, events: [], preorders: 0,
    sales: dates.map(date => ({ date, units: 20, inStoreUnits: 10, hourly: { "8": 5, "12": 5 } })), closes: dates.map((date, i) => ({ date, baked: 20, leftover: i ? 1 : 0, soldOut: !i, soldOutAt: i ? null : "10:00", status: "closed" })) });
  assert.equal(result.explain.corrections[0].share, 0.5);
  assert.equal(result.explain.corrections[0].demand, 26, "only the 10 counter units get ×1.6, plus 10 same-day online");
});
