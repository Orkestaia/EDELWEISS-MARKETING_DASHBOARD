import { dateKey, monday, shiftDate } from "./domain";

export interface KpiRow {
  date: string; units: number; correctedDemand: number | null; baked: number | null; leftover: number | null;
  tgtg: number | null; reused: number | null; discarded: number | null; soldOut: boolean | null;
  soldOutAt: string | null; suggested: number | null;
}
export interface ComparisonDay { date: string; units: number; revenueCents: number; complete: boolean; closed: boolean }
export interface StockKpis {
  totals: { units: number | null; baked: number | null; leftover: number | null; tgtg: number | null; reused: number | null; discarded: number | null };
  sellThroughPercent: number | null; discardedPercent: number | null; tgtgPercent: number | null; reusedPercent: number | null;
  soldOutDays: number | null; averageSellOutTime: string | null;
  bias: number | null; wmape: number | null; trackingSignal: number | null; trafficLight: "unknown" | "green" | "red";
  coverage: { rows: number; bakedRows: number; sellThroughRows: number; discardedRows: number; tgtgRows: number; reusedRows: number; soldOutRows: number; sellOutTimeRows: number; accuracyRows: number };
}
export type ComparisonMode = "total" | "mean-per-open-day";
export interface ComparePeriodsInput { current: readonly ComparisonDay[]; previous: readonly ComparisonDay[]; mode: ComparisonMode }
export interface PeriodValues {
  units: number | null; revenueCents: number | null; openDayCount: number;
  coverage: { rows: number; completeDays: number; excludedIncompleteDays: number; closedDays: number };
}
export interface PeriodComparison {
  actual: PeriodValues; prior: PeriodValues; mode: ComparisonMode;
  delta: { units: number | null; revenueCents: number | null };
  deltaPercent: { units: number | null; revenueCents: number | null };
}
export interface DateRange { from: string; to: string }
export interface PeriodRanges { current: DateRange; previous: DateRange; mode: ComparisonMode; note: string }
export type MovingHoliday = "Thanksgiving" | "Easter" | "Mother's Day" | "Memorial Day" | "Labor Day";
export interface HolidayAlignment {
  holiday: MovingHoliday; label: string; offsetDays: number; date: string; referenceDate: string;
  holidayDate: string; referenceHolidayDate: string;
}

function validNumber(value: number, signed = false): void {
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER || (!signed && value < 0)) throw new RangeError("Use finite valid counts and amounts.");
}
function sum(values: readonly number[]): number {
  const total = values.reduce((result, value) => result + value, 0);
  validNumber(total, true); return total;
}
function percent(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  const value = numerator / denominator * 100;
  return Number.isFinite(value) ? value : null;
}
function uniqueDates(rows: readonly { date: string }[]): void {
  const dates = new Set<string>();
  for (const row of rows) {
    dateKey(row.date);
    if (dates.has(row.date)) throw new RangeError("Each daily row must have a unique date.");
    dates.add(row.date);
  }
}
function timeMinutes(value: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new RangeError("Use a valid HH:MM sell-out time.");
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

/** Unknown closes remain unknown; every rate uses matching numerator/denominator rows. */
export function calculateKpis(rows: readonly KpiRow[]): StockKpis {
  uniqueDates(rows);
  const countFields = ["units", "correctedDemand", "baked", "leftover", "tgtg", "reused", "discarded", "suggested"] as const;
  for (const row of rows) {
    for (const field of countFields) if (row[field] !== null) validNumber(row[field]);
    if (row.soldOutAt !== null) timeMinutes(row.soldOutAt);
    if (row.soldOut !== null && typeof row.soldOut !== "boolean") throw new RangeError("Sell-out status must be known or null.");
  }
  type TotalField = "units" | "baked" | "leftover" | "tgtg" | "reused" | "discarded";
  const total = (field: TotalField): number | null => !rows.length || rows.some(row => row[field] === null) ? null : sum(rows.map(row => row[field] as number));
  const ratio = (field: "units" | "discarded" | "tgtg" | "reused") => {
    const complete = rows.filter(row => row.baked !== null && row[field] !== null);
    return { value: percent(sum(complete.map(row => row[field] as number)), sum(complete.map(row => row.baked as number))), count: complete.length };
  };
  const sellThrough = ratio("units"), discarded = ratio("discarded"), tgtg = ratio("tgtg"), reused = ratio("reused");
  const knownSellOuts = rows.filter(row => row.soldOut !== null);
  const sellOutTimes = rows.filter(row => row.soldOut === true && row.soldOutAt !== null).map(row => timeMinutes(row.soldOutAt as string));
  const averageMinutes = sellOutTimes.length ? Math.round(sum(sellOutTimes) / sellOutTimes.length) : null;
  // A null corrected demand never falls back to units sold: that would reward
  // underproduction on days whose true demand was censored by selling out.
  const pairs = rows.filter(row => row.suggested !== null && row.correctedDemand !== null);
  const errors = pairs.map(row => (row.suggested as number) - (row.correctedDemand as number));
  const errorTotal = sum(errors), absoluteError = sum(errors.map(value => Math.abs(value)));
  const demandTotal = sum(pairs.map(row => row.correctedDemand as number));
  const bias = pairs.length ? errorTotal / pairs.length : null;
  const mad = pairs.length ? absoluteError / pairs.length : null;
  const trackingSignal = mad === null ? null : mad === 0 ? (demandTotal > 0 ? 0 : null) : errorTotal / mad;
  return {
    totals: { units: total("units"), baked: total("baked"), leftover: total("leftover"), tgtg: total("tgtg"), reused: total("reused"), discarded: total("discarded") },
    sellThroughPercent: sellThrough.value, discardedPercent: discarded.value, tgtgPercent: tgtg.value, reusedPercent: reused.value,
    soldOutDays: knownSellOuts.length ? knownSellOuts.filter(row => row.soldOut).length : null,
    averageSellOutTime: averageMinutes === null ? null : `${String(Math.floor(averageMinutes / 60)).padStart(2, "0")}:${String(averageMinutes % 60).padStart(2, "0")}`,
    bias, wmape: percent(absoluteError, demandTotal), trackingSignal,
    trafficLight: trackingSignal === null ? "unknown" : Math.abs(trackingSignal) > 4 ? "red" : "green",
    coverage: { rows: rows.length, bakedRows: rows.filter(row => row.baked !== null).length,
      sellThroughRows: sellThrough.count, discardedRows: discarded.count, tgtgRows: tgtg.count, reusedRows: reused.count,
      soldOutRows: knownSellOuts.length, sellOutTimeRows: sellOutTimes.length, accuracyRows: pairs.length },
  };
}

function periodValues(rows: readonly ComparisonDay[], mode: ComparisonMode): PeriodValues {
  uniqueDates(rows);
  for (const row of rows) {
    validNumber(row.units); validNumber(row.revenueCents, true);
    if (typeof row.complete !== "boolean" || typeof row.closed !== "boolean") throw new RangeError("Confirm completion and closure for each day.");
  }
  const open = rows.filter(row => row.complete && !row.closed);
  const divisor = mode === "mean-per-open-day" ? open.length : 1;
  return { units: open.length ? sum(open.map(row => row.units)) / divisor : null,
    revenueCents: open.length ? sum(open.map(row => row.revenueCents)) / divisor : null, openDayCount: open.length,
    coverage: { rows: rows.length, completeDays: rows.filter(row => row.complete).length,
      excludedIncompleteDays: rows.filter(row => !row.complete).length, closedDays: rows.filter(row => row.closed).length } };
}

/** Missing dates never become zero-sales days, including in monthly averages. */
export function comparePeriods(input: ComparePeriodsInput): PeriodComparison {
  if (!["total", "mean-per-open-day"].includes(input.mode)) throw new RangeError("Choose a valid comparison mode.");
  const actual = periodValues(input.current, input.mode), prior = periodValues(input.previous, input.mode);
  const delta = (a: number | null, b: number | null) => a === null || b === null ? null : a - b;
  const unitDelta = delta(actual.units, prior.units), revenueDelta = delta(actual.revenueCents, prior.revenueCents);
  return { actual, prior, mode: input.mode, delta: { units: unitDelta, revenueCents: revenueDelta },
    deltaPercent: { units: unitDelta === null || prior.units === null ? null : percent(unitDelta, prior.units),
      revenueCents: revenueDelta === null || prior.revenueCents === null ? null : percent(revenueDelta, prior.revenueCents) } };
}

export function periodRanges(date: string, kind: "week" | "month" | "year"): PeriodRanges {
  dateKey(date);
  if (kind === "week") {
    const first = monday(date);
    return { current: { from: first, to: shiftDate(first, 6) }, previous: { from: shiftDate(first, -7), to: shiftDate(first, -1) }, mode: "total", note: "Monday–Sunday against the previous Monday–Sunday." };
  }
  if (kind === "month") {
    const first = date.slice(0, 7) + "-01";
    const next = new Date(first + "T12:00:00Z"); next.setUTCMonth(next.getUTCMonth() + 1);
    const priorEnd = shiftDate(first, -1);
    return { current: { from: first, to: shiftDate(next.toISOString().slice(0, 10), -1) }, previous: { from: priorEnd.slice(0, 7) + "-01", to: priorEnd }, mode: "mean-per-open-day", note: "Mean per observed open day; incomplete days and closures are excluded." };
  }
  if (kind === "year") {
    const prior = shiftDate(date, -364);
    return { current: { from: date, to: date }, previous: { from: prior, to: prior }, mode: "total", note: "364 days earlier to compare the same weekday; moving holidays can be aligned separately." };
  }
  throw new RangeError("Choose week, month or year.");
}

function nthWeekday(year: number, month: number, weekday: number, nth: number): string {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  return shiftDate(first, (weekday - new Date(first + "T12:00:00Z").getUTCDay() + 7) % 7 + (nth - 1) * 7);
}
function easter(year: number): string {
  // Gregorian computus (Meeus/Jones/Butcher), using integer arithmetic.
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const value = h + l - 7 * m + 114;
  return `${year}-${String(Math.floor(value / 31)).padStart(2, "0")}-${String(value % 31 + 1).padStart(2, "0")}`;
}
function holidays(year: number): Record<MovingHoliday, string> {
  const mayEnd = `${year}-05-31`;
  const memorial = shiftDate(mayEnd, -((new Date(mayEnd + "T12:00:00Z").getUTCDay() - 1 + 7) % 7));
  return { Thanksgiving: nthWeekday(year, 11, 4, 4), Easter: easter(year), "Mother's Day": nthWeekday(year, 5, 0, 2), "Memorial Day": memorial, "Labor Day": nthWeekday(year, 9, 1, 1) };
}

/** US holidays used by the Maine bakery; nearest holiday wins within ±7 days. */
export function holidayAlignment(date: string): HolidayAlignment | null {
  dateKey(date);
  const year = Number(date.slice(0, 4));
  if (year < 1584) return null;
  const current = holidays(year), previous = holidays(year - 1);
  const candidates = (Object.entries(current) as [MovingHoliday, string][]).map(([holiday, holidayDate]) => ({
    holiday, holidayDate, offset: Math.round((Date.parse(date + "T12:00:00Z") - Date.parse(holidayDate + "T12:00:00Z")) / 86400000),
  })).filter(value => Math.abs(value.offset) <= 7).sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset) || a.holidayDate.localeCompare(b.holidayDate));
  const match = candidates[0];
  if (!match) return null;
  return { holiday: match.holiday, label: match.holiday + (match.offset ? ` ${match.offset > 0 ? "+" : ""}${match.offset}` : ""), offsetDays: match.offset, date,
    referenceDate: shiftDate(previous[match.holiday], match.offset), holidayDate: match.holidayDate, referenceHolidayDate: previous[match.holiday] };
}
