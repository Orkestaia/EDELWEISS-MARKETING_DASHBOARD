import type { Database } from "./service";
import { calculateKpis, comparePeriods, holidayAlignment, periodRanges, type HolidayAlignment, type KpiRow, type PeriodComparison, type PeriodRanges, type StockKpis } from "./analytics";
import { dateKey, shiftDate, StockError } from "./domain";
import { FAMILIES } from "./types";

export interface AnalyticsInput { date: string; kind: "week" | "month" | "year"; productKey?: string; family?: string }
export interface AnalyticsProduct { id: string; name: string; family: string; mapped: boolean }
export interface AnalyticsDay { date: string; units: number | null; revenueCents: number | null; complete: boolean; closed: boolean }
export interface AnalyticsView {
  date: string; kind: AnalyticsInput["kind"]; productKey?: string; family?: string;
  products: AnalyticsProduct[];
  selection: { totalProductCount: number; selectedProductCount: number; mappedProductCount: number };
  ranges: PeriodRanges; holidayAlignment: HolidayAlignment | null; comparison: PeriodComparison; kpis: StockKpis;
  series: { current: AnalyticsDay[]; previous: AnalyticsDay[] }; warnings: string[];
}
const isoDay = (value: unknown) => new Date(String(value)).toISOString().slice(0, 10);
const clock = (value: unknown) => value == null ? null : String(value).slice(0, 5);
const pairKey = (date: string, productKey: string) => `${date}/${productKey}`;

export function validateAnalyticsInput(input: AnalyticsInput): AnalyticsInput {
  dateKey(input.date);
  if (!["week", "month", "year"].includes(input.kind)) throw new StockError("Choose a valid comparison period.");
  if (input.productKey !== undefined && (!input.productKey.trim() || input.productKey.length > 100)) throw new StockError("Choose a valid product.");
  if (input.family !== undefined && !FAMILIES.includes(input.family as typeof FAMILIES[number])) throw new StockError("Choose a valid product family.");
  return input;
}

/** Read-only reporting: a missing snapshot, product row or confirmed close stays unknown. */
export class AnalyticsService {
  constructor(private db: Database) {}
  async view(raw: AnalyticsInput): Promise<AnalyticsView> {
    const input = validateAnalyticsInput(raw);
    const ranges = periodRanges(input.date, input.kind);
    const alignment = input.kind === "year" ? holidayAlignment(input.date) : null;
    if (alignment) {
      ranges.previous = { from: alignment.referenceDate, to: alignment.referenceDate };
      ranges.note = `${alignment.label}: compared with the same offset from last year's ${alignment.holiday}.`;
    }
    const first = [ranges.current.from, ranges.previous.from].sort()[0];
    const last = [ranges.current.to, ranges.previous.to].sort()[1];
    const [productRows, sales, feedDays, closes, plans, calendar] = await Promise.all([
      this.db.query("select product_key,display_name,family,clover_item_id from plan_products where active order by family,display_name"),
      this.db.query("select s.date,s.product_key,s.units_in_store,s.units_online,s.revenue_cents from daily_sales s join stock_feed_days f on f.date=s.date where f.complete and s.date between $1 and $2", [first, last]),
      this.db.query("select date,complete from stock_feed_days where date between $1 and $2", [first, last]),
      this.db.query("select date,product_key,baked,leftover,tgtg,reused,discarded,sold_out,sold_out_at from daily_close where status='closed' and date between $1 and $2", [first, last]),
      this.db.query("select date,product_key,suggested,explain->>'method' as method from plan_days where explain->'forecast'='true'::jsonb and date between $1 and $2", [first, last]),
      this.db.query("select to_regclass('public.plan_events') is not null as available"),
    ]);
    const products: AnalyticsProduct[] = productRows.map(row => ({ id: String(row.product_key), name: String(row.display_name), family: String(row.family), mapped: row.clover_item_id != null }));
    if (input.productKey && !products.some(product => product.id === input.productKey)) throw new StockError("Product not found.", 404);
    const selected = products.filter(product => (!input.productKey || product.id === input.productKey) && (!input.family || product.family === input.family));
    const mapped = selected.filter(product => product.mapped);
    const events = calendar[0]?.available ? await this.db.query("select date_from,date_to,scope,scope_value from plan_events where (closed or factor=0) and date_from <= $1 and date_to >= $2", [last, first]) : [];
    const salesByKey = new Map(sales.map(row => [pairKey(isoDay(row.date), String(row.product_key)), row]));
    const closeByKey = new Map(closes.map(row => [pairKey(isoDay(row.date), String(row.product_key)), row]));
    const planByKey = new Map(plans.map(row => [pairKey(isoDay(row.date), String(row.product_key)), row]));
    const completeDates = new Set(feedDays.filter(row => row.complete).map(row => isoDay(row.date)));
    let partialClosure = false;
    const isClosed = (date: string) => {
      const affected = mapped.filter(product => events.some(event => isoDay(event.date_from) <= date && isoDay(event.date_to) >= date &&
        (event.scope === "all" || (event.scope === "family" && event.scope_value === product.family) || (event.scope === "product" && event.scope_value === product.id))));
      if (affected.length > 0 && affected.length < mapped.length) partialClosure = true;
      return affected.length > 0;
    };
    const buildDays = (from: string, to: string): AnalyticsDay[] => {
      const result: AnalyticsDay[] = [];
      for (let date = from; date <= to; date = shiftDate(date, 1)) {
        const records = mapped.map(product => salesByKey.get(pairKey(date, product.id)));
        const complete = mapped.length > 0 && completeDates.has(date) && records.every(row => row && Number.isFinite(Number(row.units_in_store) + Number(row.units_online)) && Number(row.units_in_store) + Number(row.units_online) >= 0 && Number.isFinite(Number(row.revenue_cents)));
        result.push({ date, complete, closed: isClosed(date),
          units: complete ? records.reduce((sum, row) => sum + Number(row!.units_in_store) + Number(row!.units_online), 0) : null,
          revenueCents: complete ? records.reduce((sum, row) => sum + Number(row!.revenue_cents), 0) : null });
      }
      return result;
    };
    const current = buildDays(ranges.current.from, ranges.current.to), previous = buildDays(ranges.previous.from, ranges.previous.to);
    const comparison = comparePeriods({ current: current.map(day => ({ ...day, units: day.units ?? 0, revenueCents: day.revenueCents ?? 0 })), previous: previous.map(day => ({ ...day, units: day.units ?? 0, revenueCents: day.revenueCents ?? 0 })), mode: ranges.mode });
    const kpiRows: KpiRow[] = current.filter(day => day.complete && !day.closed).map(day => {
      const finalCloses = mapped.map(product => closeByKey.get(pairKey(day.date, product.id)));
      const forecasts = mapped.map(product => planByKey.get(pairKey(day.date, product.id)));
      const allCloses = finalCloses.every(Boolean);
      const aggregate = (field: string): number | null => !allCloses || finalCloses.some(row => row?.[field] == null) ? null : finalCloses.reduce((sum, row) => sum + Number(row![field]), 0);
      const soldOut = allCloses ? finalCloses.some(row => row!.sold_out === true) : null;
      const sellOutCloses = finalCloses.filter(row => row?.sold_out === true);
      const times = sellOutCloses.map(row => clock(row!.sold_out_at));
      const averageTime = soldOut && times.length && times.every(Boolean) ? Math.round(times.reduce((sum, time) => sum + Number(time!.slice(0, 2)) * 60 + Number(time!.slice(3)), 0) / times.length) : null;
      return { date: day.date, units: day.units!, baked: aggregate("baked"), leftover: aggregate("leftover"), tgtg: aggregate("tgtg"), reused: aggregate("reused"), discarded: aggregate("discarded"),
        soldOut, soldOutAt: averageTime === null ? null : `${String(Math.floor(averageTime / 60)).padStart(2, "0")}:${String(averageTime % 60).padStart(2, "0")}`,
        correctedDemand: allCloses && soldOut === false && !forecasts.some(row => row?.method === "weekday-demand-v1.2") ? day.units : null,
        suggested: forecasts.every(Boolean) ? forecasts.reduce((sum, row) => sum + Number(row!.suggested), 0) : null };
    });
    const kpis = calculateKpis(kpiRows);
    const warnings: string[] = [];
    if (plans.some(row => row.method === "weekday-demand-v1.2")) warnings.push("Sales comparisons use payment dates. Pickup-aware forecasts are excluded from accuracy until comparable pickup-date demand is measured; the sales ledger is unchanged.");
    if (!mapped.length) warnings.push("No selected products are linked to Clover. Sales and production totals are unavailable.");
    if (selected.length > mapped.length) warnings.push(`${selected.length - mapped.length} selected products are not linked to Clover and are excluded from these totals.`);
    const missingCurrent = current.filter(day => !day.complete && !day.closed).length;
    const missingPrevious = previous.filter(day => !day.complete && !day.closed).length;
    if (missingCurrent || missingPrevious) warnings.push(`Incomplete sales coverage: ${missingCurrent} current and ${missingPrevious} previous days lack complete sales for every linked product. Missing days are unavailable, not zero sales.`);
    if (kpis.coverage.bakedRows < kpis.coverage.rows) warnings.push("Some daily closes are missing or unfinished. Production and waste totals remain unknown when a selected product has no confirmed close.");
    if (kpis.coverage.accuracyRows < kpis.coverage.rows) warnings.push("Forecast accuracy uses only saved forecasts with confirmed closes and known demand. Manual plans and uncorrected sell-out days are excluded.");
    if (partialClosure) warnings.push("A selected product is closed on some dates. Those group dates are excluded so product groups remain comparable.");
    if (!calendar[0]?.available) warnings.push("The special-date calendar is not ready. Add any shop closures before relying on open-day comparisons.");
    if (mapped.length > 1) warnings.push("For product groups, a sell-out day means at least one selected product sold out; sell-out times are averaged by day.");
    return { ...input, products, selection: { totalProductCount: products.length, selectedProductCount: selected.length, mappedProductCount: mapped.length }, ranges, holidayAlignment: alignment, comparison, kpis, series: { current, previous }, warnings };
  }
}
