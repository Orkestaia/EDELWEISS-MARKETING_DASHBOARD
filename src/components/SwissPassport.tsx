"use client";
import { useCallback, useEffect, useState } from "react";

type Customer = { id: string; email: string; first_name: string; token: string; orders: number; stamps: number; last_order: string | null; code: string | null; expires_at: string | null };
type Overview = { customers: Customer[]; rewards: { status: string; count: number }[]; averageDays: number | null; publicBaseUrl: string };
type Detail = { orders: { id: string; external_order_id: string; ordered_at: string; subtotal_cents: number; stamps_awarded: number; status: string; void_reason: string | null }[]; rewards: { code: string; status: string; expires_at: string }[] };
const date = (value: string) => new Date(value).toLocaleDateString("en-US");
function Progress({ stamps }: { stamps: number }) {
  return <div className="flex items-center gap-1" aria-label={`${stamps} of 10 stamps`}>{Array.from({ length: 10 }, (_, i) => <span key={i} aria-hidden="true" className={`grid h-5 w-5 place-items-center border text-sm ${i === 9 ? "border-0 text-xl" : "rounded-full"} ${i < stamps ? "bg-[var(--forest)] text-white" : "text-[var(--muted)]"}`}>{i === 9 ? "✿" : i < stamps ? "·" : ""}</span>)}</div>;
}
export function SwissPassport() {
  const [data, setData] = useState<Overview | null>(null), [error, setError] = useState(""), [search, setSearch] = useState(""), [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<Customer | null>(null), [detail, setDetail] = useState<Detail | null>(null), [reason, setReason] = useState(""), [order, setOrder] = useState(""), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/passport", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to load passports.");
    setData(body); setError("");
  }, []);
  useEffect(() => { load().catch(e => setError(e.message)); }, [load]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    fetch(`/api/admin/passport?customer=${selected.id}`, { signal: controller.signal, cache: "no-store" }).then(async r => { if (!r.ok) throw new Error("Unable to load customer."); setDetail(await r.json()); }).catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [selected]);
  async function voidOrder(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const r = await fetch("/api/admin/passport", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order, reason }) });
      if (!r.ok) throw new Error("Unable to void this order.");
      await load(); setSelected(selected ? { ...selected } : null); setReason(""); setOrder("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to void order."); } finally { setBusy(false); }
  }
  const customers = data?.customers.filter(c => `${c.first_name} ${c.email}`.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || filter === "near" && c.stamps >= 7 && c.stamps < 10 || filter === "reward" && c.code || filter === "inactive" && c.last_order && Date.now() - new Date(c.last_order).getTime() >= 30 * 86400000)) ?? [];
  const rewardCount = (status: string) => data?.rewards.find(r => r.status === status)?.count ?? 0;
  return <div><header className="mb-7"><p className="eyebrow">A little journey. A sweet reward.</p><h1 className="page-title">Swiss Passport</h1></header>
    {error && <div role="alert" className="error-message">{error} <button onClick={() => load().catch(e => setError(e.message))}>Retry</button></div>}
    {!data && !error && <p role="status">Loading passports…</p>}
    {data && <><div className="mb-6 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">{[
      ["Active passports", data.customers.length], ["Customers with 2+ orders", `${data.customers.length ? Math.round(data.customers.filter(c => c.orders >= 2).length / data.customers.length * 100) : 0}%`],
      ["Rewards issued", data.rewards.reduce((n, r) => n + r.count, 0)], ["Redeemed", rewardCount("redeemed")], ["Expired", rewardCount("expired")], ["Days between orders", data.averageDays?.toFixed(1) ?? "—"]
    ].map(([label, value]) => <div className="card p-4" key={label}><p className="text-xs text-[var(--muted)]">{label}</p><p className="mt-2 font-serif text-3xl">{value}</p></div>)}</div>
    <div className="mb-4 flex flex-wrap gap-3"><label className="field"><span>Find a passport</span><input type="search" placeholder="Name or email" value={search} onChange={e => setSearch(e.target.value)}/></label><label className="field"><span>Filter</span><select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All customers</option><option value="near">1–3 stamps from reward</option><option value="reward">Active reward</option><option value="inactive">No order in 30+ days</option></select></label></div>
    <div className="card overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Customer", "Journey", "Orders", "Last order", "Active reward"].map(h => <th className="p-4" key={h}>{h}</th>)}</tr></thead><tbody>{customers.map(c => <tr className="border-t border-[var(--line)]" key={c.id}><td className="p-4"><button className="text-left underline" onClick={() => { setDetail(null); setSelected(c); setOrder(""); setCopied(false); }}><strong>{c.first_name || "Guest"}</strong><span className="block text-xs">{c.email}</span></button></td><td className="p-4"><Progress stamps={c.stamps}/><span className="text-xs">{c.stamps}/10</span></td><td className="p-4">{c.orders}</td><td className="p-4">{c.last_order ? date(c.last_order) : "—"}</td><td className="p-4">{c.code ? <><code>{c.code}</code><span className="block text-xs">{Math.max(0, Math.ceil((new Date(c.expires_at!).getTime() - Date.now()) / 86400000))} days left</span></> : "—"}</td></tr>)}</tbody></table>{!customers.length && <p className="p-8 text-center">No passports match this view.</p>}</div></>}
    {selected && <div className="drawer-backdrop"><section role="dialog" aria-modal="true" aria-label="Passport customer details" className="drawer p-6" onKeyDown={e => { if (e.key === "Escape") setSelected(null); }}><button autoFocus className="secondary-button float-right" onClick={() => setSelected(null)}>Close</button><h2 className="font-serif text-3xl">{selected.first_name}</h2><p>{selected.email}</p><button className="secondary-button mt-4" onClick={async () => { try { await navigator.clipboard.writeText(`${data?.publicBaseUrl}/p/${selected.token}`); setCopied(true); } catch { setError("Clipboard unavailable. Please try another browser."); } }}>{copied ? "Copied" : "Copy passport link"}</button>
      <h3 className="mt-8 font-serif text-2xl">Order ledger</h3>{!detail ? <p>Loading…</p> : <><div className="overflow-x-auto"><table className="my-4 w-full text-left text-xs"><thead><tr>{["Date / order", "Subtotal", "Stamps", "Status", ""].map((h, i) => <th key={i} className="p-2">{h}</th>)}</tr></thead><tbody>{detail.orders.map(o => <tr key={o.id} className="border-t"><td className="p-2">{date(o.ordered_at)}<code className="block">{o.external_order_id}</code></td><td className="p-2">${(o.subtotal_cents / 100).toFixed(2)}</td><td className="p-2">{o.stamps_awarded}</td><td className="p-2">{o.status}{o.void_reason && <span className="block">{o.void_reason}</span>}</td><td>{o.status === "valid" && <button className="text-button" onClick={() => setOrder(o.id)}>Void order</button>}</td></tr>)}</tbody></table></div>
      {order && <form onSubmit={voidOrder} className="card p-4"><p className="mb-3">Voiding removes this order’s stamps and may revoke an unused reward. A previously issued reward will never be reissued.</p><label className="field"><span>Reason</span><input required maxLength={500} value={reason} onChange={e => setReason(e.target.value)}/></label><button disabled={busy || !reason.trim()} className="danger-button">{busy ? "Saving…" : "Confirm void"}</button><button type="button" className="text-button" onClick={() => setOrder("")}>Cancel</button></form>}
      <h3 className="mt-6 font-serif text-2xl">Rewards</h3>{detail.rewards.length ? detail.rewards.map(r => <p className="card mt-3 p-4" key={r.code}><code>{r.code}</code> · {r.status}<span className="block text-xs">Expires {date(r.expires_at)}</span></p>) : <p>No reward issued yet.</p>}</>}
    </section></div>}
  </div>;
}
