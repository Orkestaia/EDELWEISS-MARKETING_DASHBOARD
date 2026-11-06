"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ClipboardCheck, Package, Printer, RefreshCw, Search } from "lucide-react";
import { FAMILIES, type CloseEntry, type PlanEntry, type Product, type StockData } from "@/lib/stock/types";
import { largeOverride, maineDate, monday, shiftDate, weekday } from "@/lib/stock/domain";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const familyName = (family: string) => ({ laminated: "Croissants & Danish", bread: "Bread", pastry: "Pastries", cookie: "Cookies", cake: "Cakes & tarts", savory: "Savory", seasonal: "Seasonal" })[family] ?? family;
const displayDay = (day: string, full = false) => new Date(day + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: full ? "long" : "short", day: "numeric" });
async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, { method: body ? "POST" : "GET", cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? value.message ?? "Could not connect. Please try again.");
  return value as T;
}
import { ForecastPanel } from "./ForecastPanel";
import { PlanningSettingsPanel } from "./PlanningSettingsPanel";
import SupplierPanel from "./SupplierPanel";
import { AnalyticsPanel } from "./AnalyticsPanel";

export function StockDashboard() {
  const [selected, setSelected] = useState(() => maineDate());
  const [view, setView] = useState<"today" | "week" | "products" | "forecast" | "settings" | "suppliers" | "analytics">("today");
  const [data, setData] = useState<StockData | null>(null);
  const [actor, setActor] = useState("");
  const [search, setSearch] = useState("");
  const [family, setFamily] = useState("all");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [planEdit, setPlanEdit] = useState<{ product: Product; date: string } | null>(null);
  const loadId = useRef(0);
  const week = monday(selected);
  const load = useCallback(async () => {
    const id = ++loadId.current;
    setLoading(true); setError("");
    try { const result = await api<StockData>(`/api/stock?week=${week}`); if (id === loadId.current) setData(result); }
    catch (error) { if (id === loadId.current) setError((error as Error).message); }
    finally { if (id === loadId.current) setLoading(false); }
  }, [week]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    try { const name = sessionStorage.getItem("edelweiss-stock-staff"); if (name) setActor(name); } catch {}
  }, []);
  function changeActor(name: string) {
    setActor(name);
    try { sessionStorage.setItem("edelweiss-stock-staff", name); } catch {}
  }
  async function sync() {
    setSyncing(true); setError("");
    try { const result = await api<{ message: string }>("/api/stock/sync", {}); setNotice(result.message); await load(); }
    catch (error) { setError((error as Error).message); }
    finally { setSyncing(false); }
  }
  const plans = new Map(data?.plans.map(p => [`${p.date}/${p.productKey}`, p]));
  const closes = new Map(data?.closes.map(p => [`${p.date}/${p.productKey}`, p]));
  const planned = (p: Product, date: string) => plans.get(`${date}/${p.key}`)?.planned ?? p.pars[weekday(date)];
  const products = data?.products.filter(p => (family === "all" || p.family === family) && p.name.toLowerCase().includes(search.toLowerCase())) ?? [];
  const dates = Array.from({ length: 7 }, (_, i) => shiftDate(week, i));
  const ready = Boolean(data?.persistent && data.week === week);
  const reviewed = products.filter(p => closes.get(`${selected}/${p.key}`)?.status === "closed").length;
  const actualBaked = products.reduce((sum, p) => sum + (closes.get(`${selected}/${p.key}`)?.baked ?? 0), 0);
  const bakedCount = products.filter(p => closes.get(`${selected}/${p.key}`)?.baked != null).length;
  const savedClose = useCallback((entry: CloseEntry) => setData(current => current ? { ...current, closes: [...current.closes.filter(c => c.productKey !== entry.productKey || c.date !== entry.date), entry] } : current), []);
  const savedPlan = (entry: PlanEntry) => { setData(current => current ? { ...current, plans: [...current.plans.filter(p => p.productKey !== entry.productKey || p.date !== entry.date), entry] } : current); setPlanEdit(null); };
  return <section className="stock-app">
    <header className="stock-heading"><div><span className="stock-eyebrow">The bakery workspace</span><h1>Stock &amp; Production</h1><p>Plan the bake. Count as you go. Close with confidence.</p></div><div className="stock-header-actions"><button className="stock-button" onClick={() => { setView("week"); setSearch(""); setFamily("all"); requestAnimationFrame(() => requestAnimationFrame(() => window.print())); }} disabled={!data || loading}><Printer size={17}/> Print week</button><button className="stock-button" onClick={sync} disabled={!ready || !data?.feedConfigured || syncing}>{syncing ? <RefreshCw size={17} className="spin"/> : <RefreshCw size={17}/>} {syncing ? "Syncing…" : "Sync sales"}</button></div></header>
    <nav className="stock-tabs" aria-label="Stock workspace">{[{ id: "forecast", label: "Next bake", icon: Package }, { id: "today", label: "Today & close", icon: ClipboardCheck }, { id: "week", label: "Week plan", icon: Package }, { id: "products", label: "Products", icon: ChevronDown }, { id: "settings", label: "Settings", icon: ChevronDown }, { id: "suppliers", label: "Purchases", icon: Package }, { id: "analytics", label: "Review", icon: ClipboardCheck }].map(({ id, label, icon: Icon }) => <button key={id} aria-current={view === id ? "page" : undefined} className={view === id ? "active" : ""} onClick={() => { setView(id as typeof view); if (id === "forecast") setSelected(shiftDate(maineDate(), 1)); setPlanEdit(null); }}><Icon size={18}/>{label}</button>)}</nav>
    {error && <div className="stock-alert" role="alert">{error} <button onClick={() => void load()}>Reload data</button></div>}
    {notice && <p className="stock-notice" role="status">{notice}</p>}
    {data && !data.persistent && <div className="stock-notice"><strong>Database setup pending — read-only.</strong> These are Valentina’s manual quantities. Counts and edits cannot be saved yet.</div>}
    {data && <div className="stock-feed-note"><span className={`stock-dot ${data.snapshots.some(s => s.complete) ? "ok" : ""}`}/>{!data.feedConfigured ? "Website feed setup pending" : data.sync ? `${data.sync.message} Last sync: ${new Date(data.sync.at).toLocaleString("en-US", { timeZone: "America/New_York" })} ET` : "Website feed configured · first sync pending"}<span>{data.snapshots.filter(s => s.complete).length} complete days stored</span></div>}
    {data && data.snapshots.some(s => s.unmapped > 0) && <p className="stock-notice">Some Clover sales items are not linked to a bakery product. Their original data is retained; review the links in Products.</p>}<div className="stock-toolbar"><div className="stock-date-picker"><button aria-label="Previous day or week" onClick={() => { setSelected(shiftDate(selected, view === "week" ? -7 : -1)); setPlanEdit(null); }}><ArrowLeft size={18}/></button><label>{view === "week" ? "Week of" : "Working date"}<input type="date" value={view === "week" ? week : selected} onChange={e => { if (e.target.value) { setSelected(e.target.value); setPlanEdit(null); } }}/></label><button aria-label="Next day or week" onClick={() => { setSelected(shiftDate(selected, view === "week" ? 7 : 1)); setPlanEdit(null); }}><ArrowRight size={18}/></button><button onClick={() => setSelected(maineDate())}>Today</button></div><label className="stock-staff">Your name<input value={actor} maxLength={80} onChange={e => changeActor(e.target.value)} placeholder="Enter before editing" autoComplete="given-name"/><small>Shared login · name is self-reported</small></label></div>
    <div className="stock-filters"><label className="stock-search"><Search size={17}/><input aria-label="Find a product" placeholder="Find a product…" value={search} onChange={e => setSearch(e.target.value)}/></label><select aria-label="Product family" value={family} onChange={e => setFamily(e.target.value)}><option value="all">All families</option>{FAMILIES.map(f => <option key={f} value={f}>{familyName(f)}</option>)}</select><button className="stock-button" disabled={loading} onClick={() => void load()}>Reload</button></div>
    {loading && <p role="status" className="stock-loading">Loading the bakery workspace…</p>}
    {!loading && data?.week === week && <>
      {view === "forecast" && <ForecastPanel date={selected} actor={actor} onSaved={savedPlan} productKeys={products.map(p=>p.key)}/>}
      {view === "settings" && <PlanningSettingsPanel actor={actor}/>}
      {view === "suppliers" && <SupplierPanel actor={actor}/>}
      {view === "analytics" && <AnalyticsPanel date={selected}/>}
      {view === "today" && <><div className="stock-summary"><article><span>Planned · {displayDay(selected)}</span><strong>{products.reduce((sum, p) => sum + planned(p, selected), 0)}</strong><small>Confirmed plan or weekly defaults</small></article><article><span>Confirmed baked</span><strong>{bakedCount ? actualBaked : "—"}</strong><small>{bakedCount} of {products.length} products counted</small></article><article><span>Close progress</span><strong>{reviewed}<small> / {products.length}</small></strong><small>{reviewed === products.length && products.length ? "All displayed products reviewed" : "Review each product to finish"}</small></article></div><div className="stock-section-title"><h2>{selected === data.today ? "On the counter today" : displayDay(selected, true)}</h2><p>Enter actual quantities during the day. Review each card when closing.</p></div>{selected > data.today && <p className="stock-notice">This is a future day. Use Week plan to prepare it; actual counts open on that day.</p>}<div className="stock-close-grid">{products.map(p => <CloseCard key={`${selected}/${p.key}`} product={p} date={selected} planned={planned(p, selected)} entry={closes.get(`${selected}/${p.key}`)} sale={data.sales.find(s => s.date === selected && s.productKey === p.key)} actor={actor} enabled={ready && selected <= data.today} onSaved={savedClose}/>)}</div></>}
      {view === "week" && <div className="stock-week-view"><div className="stock-section-title"><h2>The week’s bake</h2><p>Review your saved plans and weekly defaults. A week edit only changes that date.</p></div>{planEdit && <PlanEditor key={`${planEdit.date}/${planEdit.product.key}`} product={planEdit.product} date={planEdit.date} entry={plans.get(`${planEdit.date}/${planEdit.product.key}`)} actor={actor} onSaved={savedPlan} onCancel={() => setPlanEdit(null)}/>}
        <div className="stock-week-table"><table><caption>Production plan · {displayDay(week)} – {displayDay(shiftDate(week, 6))} · manual quantities</caption><thead><tr><th scope="col">Product</th>{dates.map((d, i) => <th scope="col" key={d}>{DAYS[i]}<small>{d.slice(5)}</small></th>)}<th scope="col">Total</th></tr></thead><tbody>{FAMILIES.map(f => { const group = products.filter(p => p.family === f); return group.length ? <FamilyRows key={f} family={f} products={group} dates={dates} planned={planned} open={(p, date) => setPlanEdit({ product: p, date })} enabled={ready && Boolean(actor.trim())}/> : null; })}</tbody><tfoot><tr><th scope="row">Daily total</th>{dates.map(d => <td key={d}>{products.reduce((sum, p) => sum + planned(p, d), 0)}</td>)}<td>{products.reduce((sum, p) => sum + dates.reduce((s, d) => s + planned(p, d), 0), 0)}</td></tr></tfoot></table></div><div className="stock-mobile-week"><div className="stock-day-strip">{dates.map((d, i) => <button key={d} aria-pressed={d === selected} onClick={() => setSelected(d)}>{DAYS[i]}<strong>{d.slice(-2)}</strong></button>)}</div>{products.map(p => <button key={p.key} className="stock-mobile-plan" disabled={!ready || !actor.trim()} onClick={() => setPlanEdit({ product: p, date: selected })}><span>{p.name}<small>{familyName(p.family)}</small></span><strong>{planned(p, selected)}</strong><span aria-hidden="true">Edit →</span></button>)}</div><p className="stock-footnote">Use Next bake to review recommendations and confirmed pickup orders. Weekly defaults apply until you save a plan.</p></div>}
      {view === "products" && <><div className="stock-section-title"><h2>The bakery’s defaults</h2><p>Changes apply to dates without a saved plan. Confirm the two provisional product names with Valentina.</p></div><div className="stock-products">{products.map(p => <ProductEditor key={`${p.key}/${p.version}`} product={p} catalog={data.catalog} actor={actor} enabled={ready} onSaved={product => setData(current => current ? { ...current, products: current.products.map(p => p.key === product.key ? product : p) } : current)}/>)}</div></>}
      {!products.length && <p className="stock-empty">No products match these filters.</p>}
    </>}
  </section>;
}

function FamilyRows({ family, products, dates, planned, open, enabled }: { family: string; products: Product[]; dates: string[]; planned: (p: Product, date: string) => number; open: (p: Product, date: string) => void; enabled: boolean }) {
  return <><tr className="stock-family-row"><th scope="row">{familyName(family)}</th>{dates.map(d => <td key={d}>{products.reduce((sum, p) => sum + planned(p, d), 0)}</td>)}<td>{products.reduce((sum, p) => sum + dates.reduce((s, d) => s + planned(p, d), 0), 0)}</td></tr>{products.map(p => <tr key={p.key}><th scope="row">{p.name}{p.mappingNote && <small>Confirm name</small>}</th>{dates.map(d => <td key={d}><button aria-label={`Edit ${p.name} ${d}`} disabled={!enabled} onClick={() => open(p, d)}>{planned(p, d)}</button></td>)}<td>{dates.reduce((sum, d) => sum + planned(p, d), 0)}</td></tr>)}</>;
}
function PlanEditor({ product, date, entry, actor, onSaved, onCancel }: { product: Product; date: string; entry?: PlanEntry; actor: string; onSaved: (p: PlanEntry) => void; onCancel: () => void }) {
  const [count, setCount] = useState(String(entry?.planned ?? product.pars[weekday(date)]));
  const [reason, setReason] = useState(entry?.reason ?? "");
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  return <form className="stock-plan-editor" onSubmit={async e => {
    e.preventDefault(); setSaving(true); setError("");
    try { onSaved(await api<PlanEntry>("/api/stock", { action: "plan", date, productKey: product.key, planned: Number(count), version: entry?.version ?? 0, actor, reason })); }
    catch (error) { setError((error as Error).message); } finally { setSaving(false); }
  }}><h3>{product.name} · {displayDay(date)}</h3><label>Planned quantity<input autoFocus disabled={saving} type="number" inputMode="numeric" min="0" max="100000" step="1" required value={count} onChange={e => setCount(e.target.value)}/></label><label>Reason <small>{largeOverride(Number(count), entry?.baseline ?? product.pars[weekday(date)]) ? "Required for changes over 20%" : "Optional"}</small><input disabled={saving} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Extra trays for Saturday"/></label>{error && <p role="alert">{error}</p>}<div><button className="stock-button primary" disabled={saving || !actor.trim()}>{saving ? "Saving…" : "Save plan"}</button><button className="stock-button" type="button" disabled={saving} onClick={onCancel}>Cancel</button></div></form>;
}

type Counts = { baked: string; leftover: string; tgtg: string; reused: string; discarded: string; soldOut: boolean; soldOutAt: string };
function CloseCard({ product, date, planned, entry, sale, actor, enabled, onSaved }: { product: Product; date: string; planned: number; entry?: CloseEntry; sale?: StockData["sales"][number]; actor: string; enabled: boolean; onSaved: (c: CloseEntry) => void }) {
  const [counts, setCounts] = useState<Counts>(() => ({ baked: entry?.baked == null ? "" : String(entry.baked), leftover: entry?.leftover == null ? "" : String(entry.leftover), tgtg: String(entry?.tgtg ?? 0), reused: String(entry?.reused ?? 0), discarded: String(entry?.discarded ?? 0), soldOut: entry?.soldOut ?? false, soldOutAt: entry?.soldOutAt ?? "" }));
  const [revision, setRevision] = useState(entry?.version ?? 0);
  const [status, setStatus] = useState(entry?.status ?? "draft");
  const [dirty, setDirty] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const [lastSaved, setLastSaved] = useState(entry?.enteredAt ?? "");
  const savingRef = useRef(false);
  const draftKey = `edelweiss-stock-draft-v1/${date}/${product.key}`;
  const [recovery, setRecovery] = useState<Counts | null>(null);
  useEffect(() => {
    try { const raw = sessionStorage.getItem(draftKey); if (raw) { const saved = JSON.parse(raw); if (saved.version === (entry?.version ?? 0)) setRecovery(saved.counts); } } catch {}
    // The card is keyed by date/product. Server version changes are handled after each save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);
  const save = useCallback(async (close: boolean, confirmedCounts?: Counts) => {
    if (savingRef.current || !enabled || !actor.trim()) return;
    savingRef.current = true; setSaving(true); setError("");
    try {
      const numeric = (v: string) => v === "" ? null : Number(v);
      const values = confirmedCounts ?? counts;
      const saved = await api<CloseEntry>("/api/stock", { action: "close", productKey: product.key, date, version: revision, actor, status: close ? "closed" : "draft", baked: numeric(values.baked), leftover: numeric(values.leftover), tgtg: Number(values.tgtg), reused: Number(values.reused), discarded: Number(values.discarded), soldOut: values.soldOut, soldOutAt: values.soldOutAt || null });
      setRevision(saved.version); setStatus(saved.status); setDirty(false); setLastSaved(saved.enteredAt); onSaved(saved);
      try { sessionStorage.removeItem(draftKey); } catch {}
    } catch (error) { setError((error as Error).message); }
    finally { savingRef.current = false; setSaving(false); }
  }, [actor, counts, date, draftKey, enabled, onSaved, product.key, revision]);
  useEffect(() => {
    if (!dirty || !enabled || !actor.trim() || saving || error) return;
    const timer = setTimeout(() => void save(false), 1500);
    return () => clearTimeout(timer);
  }, [dirty, enabled, actor, saving, error, save]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function change(next: Counts) {
    setCounts(next); setDirty(true); setError("");
    try { sessionStorage.setItem(draftKey, JSON.stringify({ version: revision, counts: next })); } catch {}
  }
  const unassigned = counts.leftover === "" ? null : Number(counts.leftover) - Number(counts.tgtg) - Number(counts.reused) - Number(counts.discarded);
  return <article className={`stock-close-card ${status === "closed" && !dirty ? "closed" : ""}`}><header><div><span className="stock-eyebrow">{familyName(product.family)}</span><h3>{product.name}</h3></div><span className="stock-status">{status === "closed" && !dirty ? <><Check size={14}/> Reviewed</> : dirty ? "Unsaved" : revision ? "In progress" : "Not counted"}</span></header><div className="stock-card-context"><span>Plan <strong>{planned}</strong></span><span>{sale ? `Sales recorded: ${sale.units}` : "Sales pending"}</span></div>
    {recovery && <div className="stock-notice">An unsaved count is on this device. <button onClick={() => { change(recovery); setRecovery(null); }}>Restore</button><button onClick={() => { setRecovery(null); try { sessionStorage.removeItem(draftKey); } catch {} }}>Dismiss</button></div>}
    <fieldset disabled={!enabled || saving || !actor.trim()}><legend className="stock-sr-only">Counts for {product.name}</legend>{!revision && counts.baked === "" && counts.leftover === "" && planned > 0 && <button className="stock-quick-close" type="button" onClick={() => { const confirmed: Counts = { baked: String(planned), leftover: "0", tgtg: "0", reused: "0", discarded: "0", soldOut: true, soldOutAt: "" }; change(confirmed); void save(true, confirmed); }}>Baked {planned} as planned · all sold →</button>}<div className="stock-main-counts"><CountInput label="Actually baked" value={counts.baked} placeholder={String(planned)} onChange={v => change({ ...counts, baked: v })}/><CountInput label="Left over" value={counts.leftover} onChange={v => change({ ...counts, leftover: v })}/></div>{counts.baked === "" && <button className="stock-use-plan" type="button" onClick={() => change({ ...counts, baked: String(planned) })}>Confirm baked = plan ({planned})</button>}<details open={Number(counts.leftover) > 0 || Number(counts.tgtg) + Number(counts.reused) + Number(counts.discarded) > 0}><summary>Where did leftovers go?</summary><div className="stock-leftover-counts"><CountInput compact label="Too Good To Go" value={counts.tgtg} onChange={v => change({ ...counts, tgtg: v })}/><CountInput compact label="Reused" value={counts.reused} onChange={v => change({ ...counts, reused: v })}/><CountInput compact label="Discarded" value={counts.discarded} onChange={v => change({ ...counts, discarded: v })}/></div><p>{unassigned == null ? "Count leftovers first." : unassigned < 0 ? "Check quantities: allocations exceed leftovers." : `${unassigned} left unassigned / kept. Confirm their destination with the team.`}</p></details><div className="stock-soldout"><label><input type="checkbox" checked={counts.soldOut} onChange={e => change({ ...counts, soldOut: e.target.checked, soldOutAt: e.target.checked ? counts.soldOutAt : "" })}/> Sold out</label>{counts.soldOut && <label>Time (optional)<input type="time" value={counts.soldOutAt} onChange={e => change({ ...counts, soldOutAt: e.target.value })}/></label>}</div></fieldset>
    {error && <p className="stock-card-error" role="alert">{error}</p>}
    <footer><span aria-live="polite">{saving ? "Saving…" : dirty ? "Not saved yet" : lastSaved ? `Saved ${new Date(lastSaved).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET` : "Enter actual counts"}</span><div><button className="stock-button" disabled={!enabled || saving || !actor.trim() || !dirty} onClick={() => void save(false)}>Save progress</button><button className="stock-button primary" disabled={!enabled || saving || !actor.trim() || counts.baked === "" || counts.leftover === "" || (status === "closed" && !dirty)} onClick={() => void save(true)}>{status === "closed" && !dirty ? "Reviewed" : "Finish product"}</button></div></footer>
  </article>;
}
function CountInput({ label, value, onChange, placeholder, compact }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; compact?: boolean }) {
  return <label className={`stock-count ${compact ? "compact" : ""}`}><span>{label}</span><div>{!compact && <button type="button" aria-label={`Decrease ${label}`} disabled={value === "" || Number(value) <= 0} onClick={() => onChange(String(Math.max(0, Number(value) - 1)))}>−</button>}<input aria-label={label} type="number" inputMode="numeric" min="0" max="100000" step="1" placeholder={placeholder ?? "—"} value={value} onChange={e => onChange(e.target.value)}/>{!compact && <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(String(Math.min(100000, Number(value || 0) + 1)))}>+</button>}</div></label>;
}
function ProductEditor({ product, catalog, actor, enabled, onSaved }: { product: Product; catalog: StockData["catalog"]; actor: string; enabled: boolean; onSaved: (p: Product) => void }) {
  const [error, setError] = useState(""), [saving, setSaving] = useState(false), [saved, setSaved] = useState(false);
  return <details className="stock-product-editor"><summary><span>{product.name}<small>{familyName(product.family)}</small></span><span className="stock-status">{product.mappingNote ? "Confirm with Valentina" : product.cloverItemId ? "Linked" : "Not linked"}</span></summary><form onSubmit={async e => {
    e.preventDefault(); const form = new FormData(e.currentTarget); setSaving(true); setError("");
    try { const result = await api<Product>("/api/stock", { action: "product", productKey: product.key, version: product.version, actor, pars: DAYS.map(d => Number(form.get(d))), cloverItemId: form.get("cloverItemId") || null, confirmMapping: form.get("confirmed") === "on" }); onSaved(result); setSaved(true); }
    catch (error) { setError((error as Error).message); } finally { setSaving(false); }
  }}><fieldset disabled={!enabled || saving || !actor.trim()}><legend>Recurring weekly quantities</legend><div className="stock-par-inputs">{DAYS.map((d, i) => <label key={d}>{d}<input name={d} aria-label={`${product.name} ${d} manual par`} required type="number" inputMode="numeric" min="0" max="100000" step="1" defaultValue={product.pars[i]}/></label>)}</div><label className="stock-catalog-label">Clover product<select name="cloverItemId" defaultValue={product.cloverItemId ?? ""}><option value="">Not linked</option>{catalog.map(i => <option key={i.cloverItemId} value={i.cloverItemId}>{i.name} · {i.cloverItemId}</option>)}</select></label>{product.mappingNote && <label><input name="confirmed" type="checkbox"/> Valentina has confirmed this product name and mapping</label>}<button className="stock-button primary">{saving ? "Saving…" : "Save defaults"}</button></fieldset>{error && <p role="alert">{error}</p>}{saved && <p role="status">Defaults saved.</p>}</form></details>;
}
