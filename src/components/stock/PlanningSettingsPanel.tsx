"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { FAMILIES } from "../../lib/stock/types";
import type { PlanningEvent, PlanningSettings } from "../../lib/stock/planning-types";

interface SettingsProduct { key: string; name: string; version: number; unitsPerTray: number; bufferK: number; targetSelloutTime: string }
interface VersionedEvent extends PlanningEvent { version: number }
interface SettingsData { persistent: boolean; version: number; settings: PlanningSettings; events: VersionedEvent[]; products: SettingsProduct[] }
type EventDraft = Omit<VersionedEvent, "id"> & { id?: string };
const emptyEvent = (): EventDraft => ({ name: "", dateFrom: "", dateTo: "", factor: 1, scope: "all", scopeValue: null, closed: false, version: 0 });

export function PlanningSettingsPanel({ actor }: { actor: string }) {
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [draft, setDraft] = useState<EventDraft>(emptyEvent);
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    controller.current?.abort();
    const active = new AbortController(); controller.current = active;
    const id = ++request.current;
    setLoading(true);
    try {
      const response = await fetch("/api/stock/settings", { cache: "no-store", signal: active.signal });
      if (!response.ok) throw new Error("load");
      const result: SettingsData = await response.json();
      if (id === request.current && !active.signal.aborted) { setData(result); setError(""); return true; }
    } catch {
      if (id === request.current && !active.signal.aborted) setError("Settings could not be loaded. Please try again.");
    } finally { if (id === request.current && !active.signal.aborted) setLoading(false); }
    return false;
  }, []);
  useEffect(() => {
    void load();
    return () => { controller.current?.abort(); };
  }, [load]);
  const enabled = Boolean(data?.persistent && actor.trim()) && !loading && !saving;
  async function save(body: Record<string, unknown>, success: string): Promise<boolean> {
    if (!enabled || conflict) return false;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/stock/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, actor: actor.trim() }) });
      if (response.status === 409) { setConflict(true); setError("Someone updated these settings. Reload the latest values, review them, and try again."); return false; }
      if (!response.ok) { setError(response.status === 401 || response.status === 403 ? "Your session needs to be refreshed before saving." : "Changes could not be saved. Check the fields and try again."); return false; }
      const refreshed = await load();
      setNotice(refreshed ? success : "Changes were saved, but the latest settings could not be loaded. Reload before making another change.");
      if (!refreshed) setConflict(true);
      return true;
    } catch { setError("Could not connect. Your changes are still here. Please try again."); return false; }
    finally { setSaving(false); }
  }
  async function reload() {
    if (await load()) {
      // Event text remains available for copying, but a stale version must never
      // be silently promoted to the newest version and submitted over it.
      setConflict(false); setNotice("Latest settings loaded. Reopen an event to edit its latest saved version.");
    }
  }
  return <section className="stock-planning" aria-label="Production settings">
    <div className="planning-heading"><div><h2>Production settings</h2><p>Adjust the usual bake, shop hours and special dates.</p></div><button className="stock-button" type="button" disabled={loading || saving} onClick={() => void reload()}>Reload settings</button></div>
    {loading && <p role="status">Loading production settings…</p>}
    {error && <p className="stock-notice" role="alert">{error}</p>}
    {notice && <p className="stock-notice" role="status">{notice}</p>}
    {data && <>
      {(!data.persistent || !actor.trim()) && <p className="stock-notice">{!data.persistent ? "Saving is unavailable. Settings are read-only." : "Enter your name above before editing settings."}</p>}
      <form key={`settings/${data.version}`} className="planning-card" onSubmit={async event => {
        event.preventDefault(); const fields = new FormData(event.currentTarget);
        await save({ action: "settings", version: data.version, settings: { baseWeeks: Number(fields.get("baseWeeks")), censorCap: Number(fields.get("censorCap")), closingTime: fields.get("closingTime") } }, "Planning settings saved.");
      }}><fieldset disabled={!enabled || conflict}><legend>Shop defaults</legend><div className="planning-fields">
        <label>History weeks<input name="baseWeeks" type="number" min="1" max="12" step="1" required defaultValue={data.settings.baseWeeks}/><small>Use the same weekday from recent weeks.</small></label>
        <label>Maximum sell-out adjustment<input name="censorCap" type="number" min="1" max="3" step="0.1" required defaultValue={data.settings.censorCap}/><small>1.6 allows up to 60% more than recorded sales.</small></label>
        <label>Shop closing time<input name="closingTime" type="time" required defaultValue={data.settings.closingTime}/></label>
      </div><button className="stock-button primary">{saving ? "Saving…" : "Save shop defaults"}</button></fieldset></form>

      <section className="planning-card"><h3>Special dates &amp; closures</h3><p>A multiplier of 1 keeps the usual bake. Choose Closed to stop production for the selected products.</p>
        <div className="planning-events">{data.events.map(item => <article key={item.id}><div><strong>{item.name}</strong><p>{item.dateFrom} – {item.dateTo} · {item.scope === "all" ? "All products" : `${item.scope}: ${item.scopeValue}`} · {item.closed ? "Closed" : `×${item.factor}`}</p></div><div className="planning-actions"><button className="stock-button" type="button" disabled={!enabled || conflict} onClick={() => { setDraft({ ...item }); setNotice(""); }}>Edit <span className="stock-sr-only">{item.name}</span></button><button className="stock-button" type="button" disabled={!enabled || conflict} onClick={() => void save({ action: "deleteEvent", id: item.id, version: item.version }, "Event removed.")}>Delete <span className="stock-sr-only">{item.name}</span></button></div></article>)}</div>
        {!data.events.length && <p>No special dates yet.</p>}
        <form onSubmit={async event => {
          event.preventDefault();
          if (draft.dateTo < draft.dateFrom) { setError("The event end date must be on or after its start date."); return; }
          if (draft.scope !== "all" && !draft.scopeValue) { setError("Choose which products this event affects."); return; }
          if (await save({ action: "event", event: { ...draft, name: draft.name.trim(), scopeValue: draft.scope === "all" ? null : draft.scopeValue } }, "Event saved.")) setDraft(emptyEvent());
        }}><fieldset disabled={!enabled || conflict}><legend>{draft.id ? `Edit ${draft.name}` : "Add a special date"}</legend><div className="planning-fields">
          <label>Event name<input required maxLength={120} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })}/></label>
          <label>From<input type="date" required value={draft.dateFrom} onChange={event => setDraft({ ...draft, dateFrom: event.target.value })}/></label>
          <label>To<input type="date" required min={draft.dateFrom || undefined} value={draft.dateTo} onChange={event => setDraft({ ...draft, dateTo: event.target.value })}/></label>
          <label>Applies to<select value={draft.scope} onChange={event => setDraft({ ...draft, scope: event.target.value as PlanningEvent["scope"], scopeValue: null })}><option value="all">All products</option><option value="family">Product family</option><option value="product">One product</option></select></label>
          {draft.scope === "family" && <label>Product family<select required value={draft.scopeValue ?? ""} onChange={event => setDraft({ ...draft, scopeValue: event.target.value })}><option value="">Choose a family</option>{FAMILIES.map(family => <option key={family} value={family}>{family}</option>)}</select></label>}
          {draft.scope === "product" && <label>Product<select required value={draft.scopeValue ?? ""} onChange={event => setDraft({ ...draft, scopeValue: event.target.value })}><option value="">Choose a product</option>{data.products.map(product => <option key={product.key} value={product.key}>{product.name}</option>)}</select></label>}
          <label>Bake multiplier<input type="number" min="0" max="5" step="0.05" required value={draft.factor} onChange={event => setDraft({ ...draft, factor: Number(event.target.value) })}/><small>For example, 1.3 adds 30% before the extra allowance.</small></label>
          <label className="planning-check"><input type="checkbox" checked={draft.closed} onChange={event => setDraft({ ...draft, closed: event.target.checked })}/> Closed for these products</label>
        </div><div className="planning-actions"><button className="stock-button primary">{draft.id ? "Save event changes" : "Add event"}</button>{draft.id && <button className="stock-button" type="button" onClick={() => setDraft(emptyEvent())}>Cancel event edit</button>}</div></fieldset></form>
      </section>

      <section><h3>Product bake sizes</h3><div className="planning-cards">{data.products.map(product => <form key={`${product.key}/${product.version}`} className="planning-card" onSubmit={async event => {
        event.preventDefault(); const fields = new FormData(event.currentTarget);
        await save({ action: "parameters", productKey: product.key, version: product.version, unitsPerTray: Number(fields.get("unitsPerTray")), bufferK: Number(fields.get("bufferK")), targetSelloutTime: fields.get("targetSelloutTime") }, `${product.name} settings saved.`);
      }}><fieldset disabled={!enabled || conflict}><legend>{product.name}</legend><div className="planning-fields">
        <label>Units per tray<input name="unitsPerTray" type="number" min="1" max="1000" step="1" required defaultValue={product.unitsPerTray}/></label>
        <label>Extra allowance<input name="bufferK" type="number" min="0" max="5" step="0.1" required defaultValue={product.bufferK}/><small>0 adds none; increase gradually when demand varies.</small></label>
        <label>Target sell-out time<input name="targetSelloutTime" type="time" required defaultValue={product.targetSelloutTime}/></label>
      </div><button className="stock-button primary">Save product settings</button></fieldset></form>)}</div></section>
    </>}
  </section>;
}
