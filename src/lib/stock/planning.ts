import { dateKey, weekday } from "./domain";
import type { DemandCorrection, PlanInput, PlanResult, PlanningEvent, PlanningSale } from "./planning-types";

function nonnegative(value: number, label: string, integer = false): void {
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER || (integer && !Number.isSafeInteger(value))) {
    throw new RangeError(`${label} must be a finite non-negative ${integer ? "whole " : ""}number.`);
  }
}

function minutes(value: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new RangeError("Use a valid HH:MM time.");
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

function mean(values: readonly number[]): number {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function matches(event: PlanningEvent, input: PlanInput): boolean {
  return event.scope === "all" || (event.scope === "family" && event.scopeValue === input.product.family) ||
    (event.scope === "product" && event.scopeValue === input.product.key);
}

function validate(input: PlanInput): void {
  dateKey(input.date);
  const { product, settings } = input;
  if (product.pars.length !== 7) throw new RangeError("Provide seven manual pars, Monday through Sunday.");
  product.pars.forEach(value => nonnegative(value, "Manual par", true));
  nonnegative(product.unitsPerTray, "Units per tray", true);
  if (!product.unitsPerTray) throw new RangeError("Units per tray must be positive.");
  nonnegative(product.bufferK, "Buffer multiplier");
  nonnegative(input.preorders, "Preorders", true);
  nonnegative(settings.baseWeeks, "Base weeks", true);
  if (!settings.baseWeeks) throw new RangeError("Base weeks must be positive.");
  nonnegative(settings.censorCap, "Sell-out correction cap");
  if (settings.censorCap < 1) throw new RangeError("Sell-out correction cap must be at least one.");
  minutes(settings.closingTime); minutes(product.targetSelloutTime);
  const salesDates = new Set<string>();
  for (const sale of input.sales) {
    dateKey(sale.date); nonnegative(sale.units, "Sales");
    if (sale.inStoreUnits !== undefined) { nonnegative(sale.inStoreUnits, "Counter sales"); if (sale.inStoreUnits > sale.units) throw new RangeError("Counter sales cannot exceed base demand."); }
    if (salesDates.has(sale.date)) throw new RangeError("Daily sales must have unique dates.");
    salesDates.add(sale.date);
    if (sale.soldOutAt != null) minutes(sale.soldOutAt);
    for (const [hour, units] of Object.entries(sale.hourly)) {
      if (!/^\d{1,2}$/.test(hour) || Number(hour) > 23) throw new RangeError("Hourly sales need hours between 0 and 23.");
      nonnegative(units, "Hourly sales");
    }
  }
  const closeDates = new Set<string>();
  for (const close of input.closes) {
    dateKey(close.date);
    if (closeDates.has(close.date)) throw new RangeError("Daily closes must have unique dates.");
    closeDates.add(close.date);
    if (close.soldOutAt != null) minutes(close.soldOutAt);
    if (close.baked != null) nonnegative(close.baked, "Actual production", true);
    if (close.leftover != null) nonnegative(close.leftover, "Leftovers", true);
  }
  for (const event of input.events) {
    dateKey(event.dateFrom); dateKey(event.dateTo);
    if (event.dateFrom > event.dateTo) throw new RangeError("Event end must follow its start.");
    nonnegative(event.factor, "Event factor");
    if (!["all", "family", "product"].includes(event.scope)) throw new RangeError("Choose a valid event scope.");
  }
}

/**
 * Phase 2, method steps 1–7. All history belongs to the input product.
 * Dates are business-date strings; no machine timezone or current clock is used.
 * Population deviation describes the observed eight-day window (division by N).
 */
export function calculatePlan(input: PlanInput): PlanResult {
  validate(input);
  const { product, settings } = input;
  const warnings = new Set<string>();
  const events = input.events.filter(event => matches(event, input));
  const onDate = (date: string) => events.filter(event => event.dateFrom <= date && event.dateTo >= date);
  const targetEvents = onDate(input.date);
  const closed = targetEvents.some(event => event.closed || event.factor === 0);
  const eventFactor = closed ? 0 : targetEvents.reduce((factor, event) => factor * event.factor, 1);
  const closes = new Map(input.closes.filter(close => close.status === "closed").map(close => [close.date, close]));
  const evidence = (sale: PlanningSale) => {
    const close = closes.get(sale.date);
    return { soldOut: close?.soldOut ?? sale.soldOut, soldOutAt: close ? close.soldOutAt : sale.soldOutAt ?? null };
  };
  const past = input.sales.filter(sale => sale.date < input.date && sale.complete !== false && onDate(sale.date).length === 0);
  // Only confirmed non-sell-out days can teach the curve. Hourly totals must
  // cover the entire daily total; imported daily-only or partial data cannot.
  const curveDays = past.filter(sale => evidence(sale).soldOut === false && (sale.inStoreUnits ?? sale.units) > 0 &&
    Object.keys(sale.hourly).length > 0 && Math.abs(Object.values(sale.hourly).reduce((sum, units) => sum + units, 0) - (sale.inStoreUnits ?? sale.units)) < 0.011);
  if (!curveDays.length) warnings.add("No usable sales curve: confirmed non-sell-out days with complete hourly sales are needed.");

  const valid = past.filter(sale => weekday(sale.date) === weekday(input.date)).sort((a, b) => b.date.localeCompare(a.date));
  const window = valid.slice(0, Math.max(settings.baseWeeks, 8));
  const corrections: DemandCorrection[] = window.map(sale => {
    const state = evidence(sale);
    let share: number | null = null;
    let correctionFactor = 1;
    let capped = false;
    if (state.soldOut) {
      if (!state.soldOutAt) {
        warnings.add(`${sale.date}: sell-out time is missing; observed sales were kept.`);
      } else if (minutes(state.soldOutAt) < minutes(settings.closingTime) && curveDays.length) {
        const time = minutes(state.soldOutAt);
        // Hour buckets are spread uniformly within the hour; at 10:00 the
        // cumulative share includes hours before 10, not the entire 10 bucket.
        share = mean(curveDays.map(day => Object.entries(day.hourly).reduce((sum, [hour, units]) =>
          sum + units * Math.max(0, Math.min(1, (time - Number(hour) * 60) / 60)), 0) / (day.inStoreUnits ?? day.units)));
        if (share > 0) {
          const rawFactor = 1 / Math.min(1, share);
          correctionFactor = Math.min(settings.censorCap, rawFactor);
          capped = rawFactor > settings.censorCap;
        } else {
          warnings.add(`${sale.date}: the sales curve has no sales before sell-out; observed sales were kept.`);
        }
      } else if (minutes(state.soldOutAt) >= minutes(settings.closingTime)) {
        share = 1;
      }
    }
    return { date: sale.date, units: sale.units, demand: sale.units + (sale.inStoreUnits ?? sale.units) * (correctionFactor - 1), soldOut: state.soldOut === true,
      soldOutAt: state.soldOutAt, share, correctionFactor, capped };
  });
  const baseDays = corrections.slice(0, settings.baseWeeks);
  const baseSource = baseDays.length >= 3 ? "history" : "par";
  const manualPar = product.pars[weekday(input.date)];
  const base = baseSource === "history" ? mean(baseDays.map(day => day.demand)) : manualPar;
  if (baseSource === "par") warnings.add(`Only ${baseDays.length} valid matching weekdays; at least 3 are needed. Using the manual par.`);
  const bufferDays = corrections.slice(0, 8).map(day => day.demand);
  const average = mean(bufferDays);
  const standardDeviation = Math.sqrt(mean(bufferDays.map(value => (value - average) ** 2)));
  if (bufferDays.length < 8 && product.bufferK > 0) warnings.add(`Buffer uses ${bufferDays.length} of the preferred 8 matching weekdays; limited history.`);
  const buffer = closed ? 0 : product.bufferK * standardDeviation;
  const seasonReason = "Season factor stays at 1 in phase 2; phase 3 requires 12 months of comparable history.";
  const rawSuggestion = base * eventFactor + buffer;
  const suggested = closed ? 0 : Math.ceil(rawSuggestion / product.unitsPerTray) * product.unitsPerTray;
  const planned = closed ? 0 : suggested + input.preorders;
  nonnegative(suggested, "Suggested production", true); nonnegative(planned, "Planned production", true);
  const preordersRequireReview = closed && input.preorders > 0;
  if (preordersRequireReview) warnings.add(`Closed day: review ${input.preorders} preorders with staff; no production was added automatically.`);
  const adjustedDays = corrections.filter(day => day.correctionFactor > 1).length;
  const summary = closed ? "Closed day: no production or buffer. Check any preorders with staff." :
    `Base ${base.toFixed(2)} from ${baseSource === "history" ? `${baseDays.length} matching weekdays` : "the manual par"}, ` +
    `season ×1, events ×${eventFactor.toFixed(2)}, plus ${buffer.toFixed(2)} buffer. ` +
    `Rounded up to trays of ${product.unitsPerTray}: ${suggested}. Add ${input.preorders} preorders: ${planned} planned.` +
    (adjustedDays ? ` ${adjustedDays} sell-out days adjusted using the usual sales curve, capped at ×${settings.censorCap}.` : "");
  return { suggested, planned, preorders: input.preorders, explain: {
    base, baseSource, manualPar, sampleDates: baseDays.map(day => day.date), sampleCount: baseDays.length,
    standardDeviation, buffer, seasonFactor: 1, seasonReason, eventFactor,
    events: targetEvents.map(({ id, name, factor, closed }) => ({ id, name, factor, closed })), corrections,
    warnings: [...warnings], summary, closed, preordersRequireReview,
  } };
}
