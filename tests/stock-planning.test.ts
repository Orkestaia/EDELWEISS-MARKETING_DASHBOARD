import { test } from "node:test";
import assert from "node:assert/strict";
import { calculatePlan } from "../src/lib/stock/planning";
import type { PlanInput, PlanningEvent, PlanningSale } from "../src/lib/stock/planning-types";

const dates = ["2026-11-02", "2026-10-26", "2026-10-19", "2026-10-12", "2026-10-05", "2026-09-28", "2026-09-21", "2026-09-14", "2026-09-07"];
const sale = (date: string, units: number, hourly: Record<string, number> = {}): PlanningSale => ({ date, units, hourly });
const input = (changes: Partial<PlanInput> = {}): PlanInput => ({
  date: "2026-11-09",
  product: { key: "plain", family: "laminated", pars: [13, 2, 3, 4, 5, 6, 7], unitsPerTray: 6, bufferK: 0, targetSelloutTime: "12:00" },
  sales: [], closes: [], events: [],
  settings: { baseWeeks: 4, censorCap: 1.6, closingTime: "14:00" }, preorders: 0,
  ...changes,
});
const event = (changes: Partial<PlanningEvent> = {}): PlanningEvent => ({ id: "holiday", name: "Holiday", dateFrom: "2026-11-09", dateTo: "2026-11-09", factor: 1.5, scope: "all", scopeValue: null, closed: false, ...changes });

test("manual par is used until three valid same weekdays exist; missing data is explained", () => {
  for (const sales of [[], [sale(dates[0], 90), sale(dates[1], 90)]]) {
    const result = calculatePlan(input({ sales }));
    assert.equal(result.suggested, 18);
    assert.equal(result.explain.base, 13);
    assert.equal(result.explain.baseSource, "par");
    assert.ok(result.explain.warnings.some(message => /three|3/i.test(message)));
    assert.equal(result.explain.seasonFactor, 1);
    assert.match(result.explain.seasonReason, /12 months|phase 3/i);
  }
});

test("latest four valid weekdays determine the mean regardless of order; future and partial days are excluded", () => {
  const result = calculatePlan(input({ sales: [sale(dates[4], 900), sale(dates[2], 12), sale(dates[0], 6), sale(dates[3], 18), sale(dates[1], 12), sale("2026-11-03", 900), sale("2026-11-09", 900), sale("2026-11-16", 900), { ...sale("2026-09-07", 900), complete: false }] }));
  assert.equal(result.explain.base, 12);
  assert.equal(result.suggested, 12);
  assert.deepEqual(result.explain.sampleDates, dates.slice(0, 4));
});

test("confirmed sell-out demand uses the cumulative curve of confirmed non-sell-out days and applies the cap", () => {
  const sales = [sale(dates[0], 10, { "8": 10 }), ...dates.slice(1, 4).map(date => sale(date, 20, { "8": 10, "12": 10 }))];
  const closes = dates.slice(0, 4).map((date, i) => ({ date, baked: 20, leftover: i === 0 ? 0 : 1, soldOut: i === 0, soldOutAt: i === 0 ? "10:00" : null, status: "closed" as const }));
  const result = calculatePlan(input({ sales, closes }));
  assert.equal(result.explain.corrections[0].share, 0.5);
  assert.equal(result.explain.corrections[0].demand, 16);
  assert.equal(result.explain.corrections[0].capped, true);
  assert.equal(result.explain.base, 19);
  assert.equal(result.suggested, 24);
  assert.match(result.explain.summary, /sell-out.*1\.6/i);
});

test("sell-outs without a usable curve or time keep observed demand and warn instead of inventing sales", () => {
  const result = calculatePlan(input({ sales: dates.slice(0, 3).map(date => sale(date, 10)), closes: dates.slice(0, 3).map((date, i) => ({ date, baked: 10, leftover: 0, soldOut: true, soldOutAt: i ? "10:00" : null, status: "closed" })) }));
  assert.equal(result.explain.base, 10);
  assert.equal(result.explain.corrections[0].demand, 10);
  assert.ok(result.explain.warnings.some(message => /curve/i.test(message)));
  assert.ok(result.explain.warnings.some(message => /time/i.test(message)));
});

test("draft closes and historical stockEnd zero do not prove a sell-out or train its curve", () => {
  const source = input({ sales: dates.slice(0, 3).map(date => ({ ...sale(date, 10, { "8": 10 }), stockEnd: 0, lastSaleAt: "08:00" })), closes: [{ date: dates[0], baked: 10, leftover: 0, soldOut: true, soldOutAt: "08:30", status: "draft" }] });
  const result = calculatePlan(source);
  assert.equal(result.explain.base, 10);
  assert.ok(result.explain.corrections.every(day => !day.soldOut));
});

test("buffer uses population deviation of the last eight valid weekdays independently of the four-day base", () => {
  const source = input({ sales: dates.map((date, index) => sale(date, index < 4 ? 10 : index < 8 ? 20 : 900)) });
  source.product = { ...source.product, bufferK: 2, unitsPerTray: 6 };
  const result = calculatePlan(source);
  assert.equal(result.explain.base, 10);
  assert.equal(result.explain.standardDeviation, 5);
  assert.equal(result.explain.buffer, 10);
  assert.equal(result.suggested, 24);
});

test("matching historical events and closures are excluded while unrelated scopes keep their days", () => {
  const result = calculatePlan(input({ sales: dates.slice(0, 6).map((date, index) => sale(date, index < 2 ? 500 : 12)), events: [event({ dateFrom: dates[0], dateTo: dates[0], scope: "product", scopeValue: "plain" }), event({ id: "closed", dateFrom: dates[1], dateTo: dates[1], factor: 1, closed: true }), event({ id: "other", dateFrom: dates[2], dateTo: dates[2], scope: "family", scopeValue: "bread" })] }));
  assert.equal(result.explain.base, 12);
  assert.deepEqual(result.explain.sampleDates, dates.slice(2, 6));
});

test("events apply by all, family and product scopes inclusively and multiply before tray rounding", () => {
  const result = calculatePlan(input({ sales: dates.slice(0, 3).map(date => sale(date, 10)), events: [event(), event({ id: "family", factor: 2, scope: "family", scopeValue: "laminated" }), event({ id: "product", factor: 0.5, scope: "product", scopeValue: "plain" }), event({ id: "other", factor: 99, scope: "product", scopeValue: "bread" })] }));
  assert.equal(result.explain.eventFactor, 1.5);
  assert.equal(result.suggested, 18);
  assert.equal(result.explain.events.length, 3);
});

test("preorders stay separate and add after tray rounding", () => {
  const result = calculatePlan(input({ preorders: 5 }));
  assert.equal(result.suggested, 18);
  assert.equal(result.preorders, 5);
  assert.equal(result.planned, 23);
  assert.equal(result.explain.preordersRequireReview, false);
});

test("closure suppresses the buffer and all production and flags preorders for staff review", () => {
  const source = input({ sales: dates.slice(0, 4).map((date, i) => sale(date, i * 10)), events: [event({ closed: true, factor: 1 })], preorders: 7 });
  source.product = { ...source.product, bufferK: 1 };
  const result = calculatePlan(source);
  assert.equal(result.suggested, 0);
  assert.equal(result.planned, 0);
  assert.equal(result.preorders, 7);
  assert.equal(result.explain.buffer, 0);
  assert.equal(result.explain.closed, true);
  assert.equal(result.explain.preordersRequireReview, true);
  assert.ok(result.explain.warnings.some(message => /review/i.test(message)));
});

test("zero sales are real samples and fractional demand rounds upward only once", () => {
  const source = input({ sales: dates.slice(0, 3).map(date => sale(date, 0)) });
  assert.equal(calculatePlan(source).suggested, 0);
  source.sales = dates.slice(0, 3).map(date => sale(date, 6.01));
  assert.equal(calculatePlan(source).suggested, 12);
});

test("invalid quantities, dates, trays and duplicate sale dates are rejected before calculation", () => {
  const sources = [input({ date: "2026-02-30" }), input({ preorders: -1 }), input({ preorders: Number.NaN }), input({ sales: [sale(dates[0], -1)] }), input({ sales: [sale(dates[0], 1), sale(dates[0], 2)] })];
  const badTray = input(); badTray.product = { ...badTray.product, unitsPerTray: 0 }; sources.push(badTray);
  for (const source of sources) assert.throws(() => calculatePlan(source));
});
