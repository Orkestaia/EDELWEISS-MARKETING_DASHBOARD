"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { PlanEntry } from "../../lib/stock/types";
import type { PlanExplanation } from "../../lib/stock/planning-types";

export interface ForecastRow {
  productKey: string; name: string; family: string; manualPar: number; unitsPerTray: number;
  suggested: number; planned: number; preorders: number; explain: PlanExplanation;
  existingPlan: Pick<PlanEntry, "planned" | "baseline" | "reason" | "version"> | null;
}
interface ForecastData {
  date: string; rows: ForecastRow[]; persistent: boolean;
  preordersStatus: { available: boolean; message: string; unmapped: number };
}
interface ForecastPanelProps {
  date: string; actor: string; onSaved: (entry: PlanEntry) => void; productKeys?: string[];
}

export function ForecastPanel({ date, actor, onSaved, productKeys }: ForecastPanelProps) {
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    controller.current?.abort();
    const active = new AbortController(); controller.current = active;
    const id = ++request.current;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/stock/planning?date=${encodeURIComponent(date)}`, { cache: "no-store", signal: active.signal });
      if (!response.ok) throw new Error("load");
      const result: ForecastData = await response.json();
      if (id === request.current && !active.signal.aborted) { setData(result); return true; }
    } catch {
      if (id === request.current && !active.signal.aborted) setError("The plan could not be loaded. Please try again.");
    } finally {
      if (id === request.current && !active.signal.aborted) setLoading(false);
    }
    return false;
  }, [date]);
  useEffect(() => {
    void load();
    return () => { controller.current?.abort(); };
  }, [load]);
  const current = data?.date === date ? data : null;
  const rows = current?.rows.filter(row => !productKeys || productKeys.includes(row.productKey)) ?? [];
  function saved(entry: PlanEntry) {
    setData(previous => previous?.date === entry.date ? { ...previous, rows: previous.rows.map(row => row.productKey === entry.productKey ? { ...row, existingPlan: entry } : row) } : previous);
    onSaved(entry);
  }
  return <section className="stock-planning" aria-label="Production suggestions">
    <div className="planning-heading"><div><h2>Suggested bake</h2><p>Review the quantities, then save each product for {date}. Saved plans stay in place until you change them.</p></div><button className="stock-button" type="button" disabled={loading} onClick={() => void load()}>Reload suggestions</button></div>
    {loading && <p role="status">Loading production suggestions…</p>}
    {error && <p className="stock-notice" role="alert">{error} <button className="stock-button" type="button" onClick={() => void load()}>Try again</button></p>}
    {current && <>
      {!current.persistent && <p className="stock-notice">Saving is unavailable. You can review the suggestions.</p>}
      {!actor.trim() && <p className="stock-notice">Enter your name above before editing the plan.</p>}
      <p className="stock-notice" role="status">{current.preordersStatus.message}{!current.preordersStatus.available && " Preorders are not included automatically."}{current.preordersStatus.unmapped > 0 && ` ${current.preordersStatus.unmapped} preorder items need a product link.`}{(!current.preordersStatus.available || current.preordersStatus.unmapped > 0) && " Confirm pickup orders before saving these suggestions. Use Week plan if staff need to enter a reviewed manual plan."}</p>
      <div className="planning-cards">{rows.map(row => <ForecastPlanCard key={`${date}/${row.productKey}`} date={date} row={row} actor={actor} persistent={current.persistent && !loading && current.preordersStatus.available && current.preordersStatus.unmapped === 0} onSaved={saved} onReload={load}/>)}</div>
      {!loading && rows.length === 0 && <p>No products match this view.</p>}
    </>}
  </section>;
}

export function ForecastPlanCard({ row, date, actor, persistent, onSaved, onReload }: {
  row: ForecastRow; date: string; actor: string; persistent: boolean;
  onSaved: (entry: PlanEntry) => void; onReload: () => void | boolean | Promise<void | boolean>;
}) {
  const [draft, setDraft] = useState<{ planned: string; reason: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState("");
  const planned = draft?.planned ?? String(row.existingPlan?.planned ?? row.planned);
  const reason = draft?.reason ?? row.existingPlan?.reason ?? "";
  const baseline = row.suggested + row.preorders;
  const needsReason = Math.abs(Number(planned) - baseline) > baseline * 0.2;
  const enabled = persistent && Boolean(actor.trim()) && !saving;
  function edit(changes: Partial<{ planned: string; reason: string }>) {
    setDraft({ planned, reason, ...changes }); setNotice("");
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || conflict) return;
    const quantity = Number(planned);
    if (!planned.trim() || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > 100000) { setError("Enter a whole quantity between 0 and 100,000."); return; }
    if (needsReason && !reason.trim()) { setError("Add a reason for a change over 20%."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/stock/planning", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply", date, productKey: row.productKey, planned: quantity, version: row.existingPlan?.version ?? 0, reason: reason.trim(), actor: actor.trim() }) });
      if (response.status === 409) {
        // Freeze even an untouched suggested value before loading a newer saved plan.
        setDraft({ planned, reason }); setConflict(true);
        setError("The plan needs another review. Reload the latest version and pickup-order status, review your quantities, then save again. Your changes are kept.");
        return;
      }
      if (!response.ok) { setError(response.status === 401 || response.status === 403 ? "Your session needs to be refreshed before saving." : "The plan could not be saved. Check the quantity and reason, then try again."); return; }
      const entry: PlanEntry = await response.json();
      onSaved(entry); setDraft(null); setNotice("Plan saved.");
    } catch { setError("Could not connect. Your changes are still here. Please try again."); }
    finally { setSaving(false); }
  }
  return <article className="planning-card">
    <header><div><h3>{row.name}</h3><p>{row.family} · {row.unitsPerTray} per tray</p></div>{row.existingPlan && <span className="planning-saved">Saved plan</span>}</header>
    <dl className="planning-quantities"><div><dt>Manual par</dt><dd>{row.manualPar}</dd></div><div><dt>Suggested</dt><dd>{row.suggested}</dd></div><div><dt>Preorders</dt><dd>{row.preorders}</dd></div></dl>
    <form onSubmit={submit}><fieldset disabled={!enabled}>
      <legend className="stock-sr-only">Plan for {row.name}</legend>
      <label>Planned quantity<input aria-label={`${row.name} planned quantity`} name="planned" type="number" inputMode="numeric" min="0" max="100000" step="1" required value={planned} onChange={event => edit({ planned: event.target.value })}/></label>
      <label>Reason <small>{needsReason ? "Required for a change over 20%" : "Optional"}</small><input name="reason" aria-label={`${row.name} reason`} required={needsReason} maxLength={500} value={reason} onChange={event => edit({ reason: event.target.value })}/></label>
      <div className="planning-actions"><button className="stock-button primary" disabled={conflict}>{saving ? "Saving…" : "Save plan"}</button><button className="stock-button" type="button" disabled={conflict} onClick={() => edit({ planned: String(row.planned), reason: "" })}>Use suggestion</button></div>
    </fieldset></form>
    {error && <p className="stock-notice" role="alert">{error}</p>}
    {conflict && <button type="button" className="stock-button" disabled={saving || !persistent} onClick={async () => {
      if (await onReload() === false) return;
      setConflict(false); setError(""); setNotice("Your quantities are kept. Review the latest saved plan before saving.");
    }}>Reload latest plan</button>}
    {notice && <p role="status">{notice}</p>}
    <details className="planning-explanation"><summary>Why this quantity?</summary><p>{row.explain.summary}</p><p>{row.explain.seasonReason}</p>{row.explain.warnings.length > 0 && <ul>{row.explain.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}</details>
  </article>;
}
