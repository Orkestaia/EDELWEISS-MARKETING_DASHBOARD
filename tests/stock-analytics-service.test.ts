import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StockService, type Connection, type Row } from "../src/lib/stock/service";
import { PlanningService } from "../src/lib/stock/planning-service";
import { AnalyticsService } from "../src/lib/stock/analytics-service";
import { AnalyticsReport } from "../src/components/stock/AnalyticsPanel";
import type { Product, SalesFeed } from "../src/lib/stock/types";

async function fixture() {
  const pg = new PGlite();
  const connection = (client: Pick<PGlite, "query">): Connection => ({ query: async <T extends Row>(sql: string, values: unknown[] = []) => (await client.query<T>(sql, values)).rows });
  const db = { ...connection(pg), transaction: <T>(fn: (tx: Connection) => Promise<T>) => pg.transaction(tx => fn(connection(tx))) };
  const seed: Product[] = [{ key: "plain", name: "Plain", family: "laminated", pars: [12,12,12,12,12,12,12], cloverItemId: null, mappingNote: "", version: 1 }, { key: "bread", name: "Bread", family: "bread", pars: [12,12,12,12,12,12,12], cloverItemId: null, mappingNote: "", version: 1 }, { key: "unmapped", name: "Unmapped", family: "cake", pars: [1,1,1,1,1,1,1], cloverItemId: null, mappingNote: "", version: 1 }];
  const stock = new StockService(db); await stock.migrate(seed);
  await new PlanningService(db, async () => ({ quantities: {}, status: { available: true, message: "Checked", unmapped: 0 } })).migrate();
  await pg.query("update plan_products set clover_item_id=product_key||'-id' where product_key in ('plain','bread')");
  const snapshot = async (date: string, units: number, complete = true, includeBread = true) => {
    const payload: SalesFeed = { date, timezone: "America/New_York", generatedAt: `${date}T23:00:00Z`, complete, items: (includeBread ? ["plain", "bread"] : ["plain"]).map(key => ({ cloverItemId: `${key}-id`, name: key, unitsInStore: units, unitsOnline: 0, unitsTotal: units, revenueCents: units * 400, firstSaleAt: "08:00", lastSaleAt: "09:00", hourly: { "8": units }, stockEnd: 0 })) };
    await stock.saveSnapshot(payload);
  };
  const close = (date: string, product: string, soldOut = false, status = "closed") => pg.query("insert into daily_close(date,product_key,baked,leftover,tgtg,reused,discarded,sold_out,sold_out_at,entered_by,status) values($1,$2,12,$3,0,0,$3,$4,$5,'Staff',$6) on conflict(date,product_key) do update set status=excluded.status,sold_out=excluded.sold_out,sold_out_at=excluded.sold_out_at,leftover=excluded.leftover,discarded=excluded.discarded", [date, product, soldOut ? 0 : 2, soldOut, soldOut ? "09:00" : null, status]);
  const plan = (date: string, product: string, forecast: boolean) => pg.query("insert into plan_days(date,product_key,suggested,planned,explain,created_by) values($1,$2,12,12,$3::jsonb,'Staff')", [date, product, JSON.stringify({ forecast })]);
  return { pg, db, snapshot, close, plan, service: new AnalyticsService(db) };
}

test("analytics reads complete snapshots and reports absent days and product mappings without inventing zeros", async () => {
  const f = await fixture();
  try {
    await f.snapshot("2026-11-02", 10);
    await f.snapshot("2026-11-03", 100, false);
    await f.snapshot("2026-11-04", 10, true, false);
    await f.snapshot("2026-10-26", 5);
    const view = await f.service.view({ date: "2026-11-05", kind: "week" });
    assert.deepEqual(view.selection, { totalProductCount: 3, selectedProductCount: 3, mappedProductCount: 2 });
    assert.equal(view.comparison.actual.units, 20);
    assert.equal(view.comparison.prior.units, 10);
    assert.equal(view.comparison.actual.openDayCount, 1);
    assert.equal(view.series.current.find(row => row.date === "2026-11-03")?.units, null);
    assert.equal(view.series.current.find(row => row.date === "2026-11-04")?.complete, false);
    assert.equal(view.series.current.find(row => row.date === "2026-11-05")?.units, null);
    assert.ok(view.warnings.some(message => /not linked|unmapped/i.test(message)));
    assert.equal(view.kpis.totals.baked, null);
    await f.close("2026-11-02", "plain");
    const group = await f.service.view({ date: "2026-11-05", kind: "week" });
    assert.equal(group.kpis.totals.baked, null, "one confirmed product cannot make a group close complete");
    const single = await f.service.view({ date: "2026-11-05", kind: "week", productKey: "plain" });
    assert.equal(single.kpis.totals.baked, null, "the other observed plain-only date still lacks its close");
    await f.snapshot("2026-11-03", 20);
    const month = await f.service.view({ date: "2026-11-05", kind: "month" });
    assert.equal(month.comparison.actual.units, 30);
    assert.equal(month.comparison.actual.openDayCount, 2);
    assert.equal(month.comparison.mode, "mean-per-open-day");
    const markup = renderToStaticMarkup(createElement(AnalyticsReport, { data: view }));
    assert.match(markup, /role="img"/);
    assert.match(markup, /Daily sales coverage/);
    assert.match(markup, /Unavailable/);
    assert.doesNotMatch(markup, /NaN|undefined/);
  } finally { await f.pg.close(); }
});

test("accuracy requires final closes and genuine saved forecasts, never historical zero stock or manual pars", async () => {
  const f = await fixture();
  try {
    for (const date of ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]) await f.snapshot(date, 10);
    await f.close("2026-11-02", "plain"); await f.plan("2026-11-02", "plain", true);
    await f.close("2026-11-03", "plain", true); await f.plan("2026-11-03", "plain", true);
    await f.close("2026-11-04", "plain"); await f.plan("2026-11-04", "plain", false);
    await f.close("2026-11-05", "plain", false, "draft"); await f.plan("2026-11-05", "plain", true);
    const view = await f.service.view({ date: "2026-11-05", kind: "week", productKey: "plain" });
    assert.equal(view.kpis.coverage.accuracyRows, 1);
    assert.equal(view.kpis.bias, 2);
    assert.equal(view.kpis.wmape, 20);
    await f.pg.query("update plan_days set explain=explain || '{\"method\":\"weekday-demand-v1.2\"}'::jsonb where date='2026-11-02' and product_key='plain'");
    const pickupAware = await f.service.view({ date: "2026-11-05", kind: "week", productKey: "plain" });
    assert.equal(pickupAware.kpis.coverage.accuracyRows, 0);
    assert.ok(pickupAware.warnings.some(message => /payment dates.*Pickup-aware/.test(message)));
    assert.equal(view.kpis.coverage.soldOutRows, 3);
    assert.equal(view.kpis.soldOutDays, 1);
    assert.equal(view.kpis.totals.baked, null);
  } finally { await f.pg.close(); }
});

test("calendar closures respect product scope and yearly comparisons align moving holidays", async () => {
  const f = await fixture();
  try {
    await f.snapshot("2026-11-26", 10); await f.snapshot("2025-11-27", 5);
    const year = await f.service.view({ date: "2026-11-26", kind: "year", productKey: "plain" });
    assert.equal(year.ranges.previous.from, "2025-11-27");
    assert.equal(year.comparison.prior.units, 5);
    assert.equal(year.holidayAlignment?.holiday, "Thanksgiving");
    await f.pg.query("insert into plan_events(id,date_from,date_to,name,factor,scope,scope_value,closed) values('closed','2026-11-26','2026-11-26','Closed',0,'product','plain',true)");
    const closed = await f.service.view({ date: "2026-11-26", kind: "year", productKey: "plain" });
    assert.equal(closed.comparison.actual.units, null);
    assert.equal(closed.series.current[0].closed, true);
    const bread = await f.service.view({ date: "2026-11-26", kind: "year", family: "bread" });
    assert.equal(bread.comparison.actual.units, 10);
  } finally { await f.pg.close(); }
});

test("analytics rejects invalid filters and selection without mapped sales remains unknown", async () => {
  const f = await fixture();
  try {
    await assert.rejects(() => f.service.view({ date: "2026-02-30", kind: "week" }));
    await assert.rejects(() => f.service.view({ date: "2026-11-05", kind: "invalid" as "week" }));
    await assert.rejects(() => f.service.view({ date: "2026-11-05", kind: "week", family: "invalid" }));
    await assert.rejects(() => f.service.view({ date: "2026-11-05", kind: "week", productKey: "missing" }));
    const view = await f.service.view({ date: "2026-11-05", kind: "month", productKey: "unmapped" });
    assert.equal(view.selection.mappedProductCount, 0);
    assert.equal(view.comparison.actual.units, null);
    assert.equal(view.kpis.coverage.rows, 0);
    assert.equal(view.comparison.mode, "mean-per-open-day");
  } finally { await f.pg.close(); }
});
