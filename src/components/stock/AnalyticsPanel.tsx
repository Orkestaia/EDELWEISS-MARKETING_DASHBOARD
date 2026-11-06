"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import type { AnalyticsInput, AnalyticsView, AnalyticsDay } from "../../lib/stock/analytics-service";
import { FAMILIES } from "../../lib/stock/types";

const numbers = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const count = (value: number | null) => value === null ? "Unavailable" : numbers.format(value);
const currency = (value: number | null) => value === null ? "Unavailable" : money.format(value / 100);
const percentage = (value: number | null) => value === null ? "Unavailable" : `${numbers.format(value)}%`;

export function AnalyticsPanel({ date }: { date: string }) {
  const [kind, setKind] = useState<AnalyticsInput["kind"]>("week");
  const [productKey, setProductKey] = useState("");
  const [family, setFamily] = useState("");
  const [data, setData] = useState<AnalyticsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    controller.current?.abort();
    const active = new AbortController(); controller.current = active;
    const id = ++request.current;
    setLoading(true); setError("");
    const query = new URLSearchParams({ date, kind });
    if (family) query.set("family", family);
    if (productKey) query.set("productKey", productKey);
    try {
      const response = await fetch(`/api/stock/analytics?${query}`, { cache: "no-store", signal: active.signal });
      if (!response.ok) throw new Error("load");
      const result: AnalyticsView = await response.json();
      if (id === request.current && !active.signal.aborted) setData(result);
    } catch { if (id === request.current && !active.signal.aborted) setError("Reports could not be loaded. Please try again."); }
    finally { if (id === request.current && !active.signal.aborted) setLoading(false); }
  }, [date, kind, family, productKey]);
  useEffect(() => { void load(); return () => { controller.current?.abort(); }; }, [load]);
  const current = data?.date === date && data.kind === kind && (data.productKey ?? "") === productKey && (data.family ?? "") === family ? data : null;
  return <section className="stock-analytics" aria-label="Production reports">
    <header className="analytics-heading"><div><h2>Sales &amp; production reports</h2><p>Compare recorded sales and see how the bake matched demand.</p></div><button className="stock-button" type="button" disabled={loading} onClick={() => void load()}>Reload reports</button></header>
    <div className="analytics-controls"><label>Compare<select value={kind} onChange={event => setKind(event.target.value as AnalyticsInput["kind"])}><option value="week">Week vs previous week</option><option value="month">Month vs previous month</option><option value="year">Same weekday last year</option></select></label>
      <label>Product family<select value={family} onChange={event => { setFamily(event.target.value); setProductKey(""); }}><option value="">All families</option>{FAMILIES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Product<select value={productKey} onChange={event => setProductKey(event.target.value)}><option value="">All products in this family</option>{data?.products.filter(product => !family || product.family === family).map(product => <option key={product.id} value={product.id}>{product.name}{product.mapped ? "" : " · not linked"}</option>)}</select></label>
    </div>
    {loading && <p role="status">Loading sales and production reports…</p>}
    {error && <p className="stock-notice" role="alert">{error} <button className="stock-button" type="button" onClick={() => void load()}>Try again</button></p>}
    {current && <AnalyticsReport data={current}/>}
  </section>;
}

function PeriodBars({ actual, prior, mean }: { actual: number | null; prior: number | null; mean: boolean }) {
  const titleId = useId(), descriptionId = useId();
  const max = Math.max(actual ?? 0, prior ?? 0, 1);
  const values = [{ label: "Current", value: actual, x: 68, color: "#385b4b" }, { label: "Previous", value: prior, x: 198, color: "#b49e77" }];
  return <svg className="analytics-bars" viewBox="0 0 340 230" role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
    <title id={titleId}>{`${mean ? "Mean units per open day" : "Recorded units"}, current versus previous period`}</title>
    <desc id={descriptionId}>Current: {count(actual)}. Previous: {count(prior)}. Missing data has no bar.</desc>
    <line x1="30" x2="315" y1="175" y2="175" stroke="#d9ded5"/>
    {values.map(({ label, value, x, color }) => <g key={label}>
      {value !== null && <rect x={x} y={175 - value / max * 130} width="65" height={value / max * 130} rx="4" fill={color}/>}
      <text x={x + 32} y={value === null ? 155 : 165 - value / max * 130} textAnchor="middle" fill="#263e33" fontSize="13">{value === null ? "No data" : count(value)}</text>
      <text x={x + 32} y="200" textAnchor="middle" fill="#627268" fontSize="13">{label}</text>
    </g>)}
  </svg>;
}

export function AnalyticsReport({ data }: { data: AnalyticsView }) {
  const { comparison, kpis, ranges, selection } = data;
  const metrics = [
    { label: "Recorded units", value: count(kpis.totals.units) }, { label: "Confirmed baked", value: count(kpis.totals.baked) },
    { label: "Sell-through", value: percentage(kpis.sellThroughPercent) }, { label: "Discarded", value: percentage(kpis.discardedPercent) },
    { label: "Too Good To Go", value: percentage(kpis.tgtgPercent) }, { label: "Reused", value: percentage(kpis.reusedPercent) },
    { label: "Sell-out days", value: count(kpis.soldOutDays) }, { label: "Average sell-out time", value: kpis.averageSellOutTime ?? "Unavailable" },
    { label: "Average forecast over / under", value: count(kpis.bias) }, { label: "Forecast error", value: percentage(kpis.wmape) },
  ];
  return <>
    <div className="analytics-coverage" role="status"><strong>{selection.mappedProductCount} of {selection.selectedProductCount} selected products linked to sales</strong><p>Current: {comparison.actual.openDayCount} recorded open days. Previous: {comparison.prior.openDayCount} recorded open days. Complete closes: {kpis.coverage.bakedRows} of {kpis.coverage.rows} recorded days. Accuracy: {kpis.coverage.accuracyRows} days.</p></div>
    {data.warnings.length > 0 && <aside className="stock-notice analytics-warnings" aria-label="Report coverage warnings"><strong>Read with these limits</strong><ul>{data.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></aside>}
    <div className="analytics-comparison"><article className="analytics-card"><h3>{comparison.mode === "mean-per-open-day" ? "Sales per open day" : "Recorded sales"}</h3><p>{ranges.current.from} to {ranges.current.to}<br/>Previous: {ranges.previous.from} to {ranges.previous.to}</p><p>{ranges.note}</p><PeriodBars actual={comparison.actual.units} prior={comparison.prior.units} mean={comparison.mode === "mean-per-open-day"}/></article>
      <div className="analytics-card analytics-table-wrap"><table><caption>{comparison.mode === "mean-per-open-day" ? "Mean per observed open day" : "Observed period totals"}</caption><thead><tr><th scope="col">Measure</th><th scope="col">Current</th><th scope="col">Previous</th><th scope="col">Change</th><th scope="col">Change %</th></tr></thead><tbody>
        <tr><th scope="row">Units</th><td>{count(comparison.actual.units)}</td><td>{count(comparison.prior.units)}</td><td>{count(comparison.delta.units)}</td><td>{percentage(comparison.deltaPercent.units)}</td></tr>
        <tr><th scope="row">Sales</th><td>{currency(comparison.actual.revenueCents)}</td><td>{currency(comparison.prior.revenueCents)}</td><td>{currency(comparison.delta.revenueCents)}</td><td>{percentage(comparison.deltaPercent.revenueCents)}</td></tr>
      </tbody></table><p>Percent change is unavailable when the previous value is zero or missing.</p></div>
    </div>
    <section className="analytics-card"><h3>How the bake performed</h3><p>Current period only. Percentages use days with confirmed production counts. Positive forecast bias means more was suggested than was needed.</p><dl className="analytics-metrics">{metrics.map(metric => <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}</dl>
      <p className={`analytics-signal analytics-signal-${kpis.trafficLight}`}><strong>{kpis.trafficLight === "unknown" ? "Forecast trend unavailable" : kpis.trafficLight === "red" ? "Review the forecast: repeated over- or under-production" : "Forecast trend within the review limit"}</strong><br/>Tracking signal: {count(kpis.trackingSignal)}. Review when the value goes below -4 or above +4.</p>
    </section>
    <details className="analytics-card"><summary>Daily sales coverage</summary><p>Unavailable means a final snapshot or a selected product is missing. Closed dates are excluded from the comparison.</p><div className="analytics-daily-grid"><DailyCoverage title="Current period" days={data.series.current}/><DailyCoverage title="Previous period" days={data.series.previous}/></div></details>
  </>;
}

function DailyCoverage({ title, days }: { title: string; days: AnalyticsDay[] }) {
  return <div className="analytics-table-wrap"><table><caption>{title}</caption><thead><tr><th scope="col">Date</th><th scope="col">Status</th><th scope="col">Units</th><th scope="col">Sales</th></tr></thead><tbody>{days.map(day => <tr key={day.date}><th scope="row">{day.date}</th><td>{day.closed ? "Closed" : day.complete ? "Recorded" : "Unavailable"}</td><td>{count(day.units)}</td><td>{currency(day.revenueCents)}</td></tr>)}</tbody></table></div>;
}
