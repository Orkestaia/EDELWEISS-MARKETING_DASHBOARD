import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateKpis, comparePeriods, holidayAlignment, periodRanges, type KpiRow, type ComparisonDay } from "../src/lib/stock/analytics";

const kpi = (changes: Partial<KpiRow> = {}): KpiRow => ({ date: "2026-11-02", units: 8, correctedDemand: 10, baked: 12, leftover: 4, tgtg: 1, reused: 1, discarded: 2, soldOut: false, soldOutAt: null, suggested: 12, ...changes });
const day = (changes: Partial<ComparisonDay> = {}): ComparisonDay => ({ date: "2026-11-02", units: 10, revenueCents: 4000, complete: true, closed: false, ...changes });

test("KPI totals and waste categories retain unknown counts, and ratios use the same observed rows", () => {
  const result = calculateKpis([kpi(), kpi({ date: "2026-11-03", units: 10, baked: null, leftover: null, discarded: null, tgtg: null, reused: null })]);
  assert.deepEqual(result.totals, { units: 18, baked: null, leftover: null, tgtg: null, reused: null, discarded: null });
  assert.equal(result.sellThroughPercent, 8 / 12 * 100);
  assert.equal(result.discardedPercent, 2 / 12 * 100);
  assert.equal(result.tgtgPercent, 1 / 12 * 100);
  assert.equal(result.reusedPercent, 1 / 12 * 100);
  assert.equal(result.coverage.bakedRows, 1);
  assert.equal(result.coverage.sellThroughRows, 1);
  assert.equal(result.coverage.discardedRows, 1);
});

test("bias, WMAPE and tracking signal use only complete corrected-demand/suggestion pairs", () => {
  const result = calculateKpis([kpi({ suggested: 12, correctedDemand: 10 }), kpi({ date: "2026-11-03", suggested: 16, correctedDemand: 20 }), kpi({ date: "2026-11-04", units: 100, soldOut: true, correctedDemand: null, suggested: 1000 }), kpi({ date: "2026-11-05", suggested: null })]);
  assert.equal(result.bias, -1);
  assert.equal(result.wmape, 20);
  assert.equal(result.trackingSignal, -2 / 3);
  assert.equal(result.trafficLight, "green");
  assert.equal(result.coverage.accuracyRows, 2);
});

test("consistent forecast bias turns red only beyond a tracking signal magnitude of four", () => {
  const rows = Array.from({ length: 5 }, (_, i) => kpi({ date: `2026-11-0${i + 1}`, suggested: 12, correctedDemand: 10 }));
  assert.equal(calculateKpis(rows.slice(0, 4)).trafficLight, "green");
  assert.equal(calculateKpis(rows).trackingSignal, 5);
  assert.equal(calculateKpis(rows).trafficLight, "red");
  assert.equal(calculateKpis(rows.map(row => ({ ...row, suggested: 8 }))).trackingSignal, -5);
});

test("sell-out counts distinguish unknown closes and average only confirmed sell-out times", () => {
  const result = calculateKpis([kpi({ soldOut: true, soldOutAt: "10:00" }), kpi({ date: "2026-11-03", soldOut: true, soldOutAt: "11:31" }), kpi({ date: "2026-11-04", soldOut: true, soldOutAt: null }), kpi({ date: "2026-11-05", soldOut: false, soldOutAt: "08:00" }), kpi({ date: "2026-11-06", soldOut: null, soldOutAt: null })]);
  assert.equal(result.soldOutDays, 3);
  assert.equal(result.averageSellOutTime, "10:46");
  assert.equal(result.coverage.soldOutRows, 4);
  assert.equal(result.coverage.sellOutTimeRows, 2);
});

test("missing data and zero denominators yield explicit nulls instead of false zeros or NaN", () => {
  const empty = calculateKpis([]);
  assert.equal(empty.totals.units, null);
  assert.equal(empty.soldOutDays, null);
  assert.equal(empty.bias, null);
  assert.equal(empty.wmape, null);
  assert.equal(empty.trackingSignal, null);
  assert.equal(empty.trafficLight, "unknown");
  const zero = calculateKpis([kpi({ units: 0, baked: 0, correctedDemand: 0, suggested: 0, leftover: 0, discarded: 0, tgtg: 0, reused: 0 })]);
  assert.equal(zero.wmape, null);
  assert.equal(zero.sellThroughPercent, null);
  assert.equal(zero.discardedPercent, null);
  const perfect = calculateKpis([kpi({ suggested: 10 })]);
  assert.equal(perfect.trackingSignal, 0);
  assert.equal(perfect.trafficLight, "green");
});

test("period comparisons exclude incomplete and closed days, and normalize monthly comparisons by observed open days", () => {
  const input = { current: [day(), day({ date: "2026-11-03", units: 20, revenueCents: 6000 }), day({ date: "2026-11-04", units: 999, complete: false }), day({ date: "2026-11-05", units: 999, closed: true })], previous: [day({ date: "2026-10-01", units: 10, revenueCents: 2000 })], mode: "mean-per-open-day" as const };
  const result = comparePeriods(input);
  assert.equal(result.actual.units, 15);
  assert.equal(result.prior.units, 10);
  assert.equal(result.delta.units, 5);
  assert.equal(result.deltaPercent.units, 50);
  assert.equal(result.actual.revenueCents, 5000);
  assert.equal(result.deltaPercent.revenueCents, 150);
  assert.equal(result.actual.openDayCount, 2);
  assert.deepEqual(result.actual.coverage, { rows: 4, completeDays: 3, excludedIncompleteDays: 1, closedDays: 1 });
  assert.equal(comparePeriods({ ...input, mode: "total" }).actual.units, 30);
});

test("comparison missing periods stay unknown and a real zero prior yields no percentage delta", () => {
  const missing = comparePeriods({ current: [], previous: [day()], mode: "total" });
  assert.equal(missing.actual.units, null);
  assert.equal(missing.delta.units, null);
  assert.equal(missing.deltaPercent.units, null);
  const zero = comparePeriods({ current: [day()], previous: [day({ units: 0, revenueCents: 0 })], mode: "total" });
  assert.equal(zero.prior.units, 0);
  assert.equal(zero.delta.units, 10);
  assert.equal(zero.deltaPercent.units, null);
  assert.equal(zero.deltaPercent.revenueCents, null);
});

test("period ranges use Monday weeks, complete calendar months and a 364-day weekday comparison", () => {
  const week = periodRanges("2026-11-08", "week");
  assert.deepEqual(week.current, { from: "2026-11-02", to: "2026-11-08" });
  assert.deepEqual(week.previous, { from: "2026-10-26", to: "2026-11-01" });
  const month = periodRanges("2028-03-14", "month");
  assert.deepEqual(month.current, { from: "2028-03-01", to: "2028-03-31" });
  assert.deepEqual(month.previous, { from: "2028-02-01", to: "2028-02-29" });
  assert.equal(month.mode, "mean-per-open-day");
  assert.deepEqual(periodRanges("2026-01-01", "month").previous, { from: "2025-12-01", to: "2025-12-31" });
  assert.deepEqual(periodRanges("2026-11-05", "year").previous, { from: "2025-11-06", to: "2025-11-06" });
});

test("moving holidays align the same offset from the prior year's holiday, including Easter", () => {
  const cases = [
    { date: "2026-11-24", holiday: "Thanksgiving", offset: -2, previous: "2025-11-25" },
    { date: "2026-04-05", holiday: "Easter", offset: 0, previous: "2025-04-20" },
    { date: "2026-05-10", holiday: "Mother's Day", offset: 0, previous: "2025-05-11" },
    { date: "2026-05-26", holiday: "Memorial Day", offset: 1, previous: "2025-05-27" },
    { date: "2026-09-07", holiday: "Labor Day", offset: 0, previous: "2025-09-01" },
  ];
  for (const value of cases) {
    const result = holidayAlignment(value.date);
    assert.equal(result?.holiday, value.holiday);
    assert.equal(result?.offsetDays, value.offset);
    assert.equal(result?.referenceDate, value.previous);
  }
  assert.equal(holidayAlignment("2026-11-19")?.label, "Thanksgiving -7");
  assert.equal(holidayAlignment("2026-12-03")?.label, "Thanksgiving +7");
  assert.equal(holidayAlignment("2026-11-18"), null);
});

test("analytics reject duplicate dates and invalid counts rather than double-counting or returning non-finite values", () => {
  assert.throws(() => calculateKpis([kpi(), kpi()]));
  assert.throws(() => calculateKpis([kpi({ baked: -1 })]));
  assert.throws(() => comparePeriods({ current: [day({ units: Number.NaN })], previous: [], mode: "total" }));
  assert.throws(() => comparePeriods({ current: [day(), day()], previous: [], mode: "total" }));
  assert.throws(() => periodRanges("2026-02-30", "month"));
});
