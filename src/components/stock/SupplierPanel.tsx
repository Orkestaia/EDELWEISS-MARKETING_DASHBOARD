"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { PriceComparison, SupplierCategory, SupplierData } from "@/lib/suppliers/types";
import { parseInvoice, parseSupplier } from "@/lib/suppliers/validation";

const categories: Record<SupplierCategory, string> = { food: "Food", ingredient: "Ingredients", beverage: "Beverages" };
const field = "w-full rounded-lg border border-[#cbd3c7] bg-white px-3 py-2 text-sm text-[#294236] focus:border-[#486955] focus:outline-none";
const button = "stock-button min-h-11";
function money(cents: number, currency: string) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100); }
  catch { return `${(cents / 100).toFixed(2)} ${currency}`; }
}
function priceChange(comparison: PriceComparison) {
  if (comparison.deltaCents === null) return "Need one more invoice";
  const amount = `${comparison.deltaCents > 0 ? "+" : ""}${money(comparison.deltaCents, comparison.currency)}`;
  return comparison.deltaPercent === null ? amount : `${amount} (${comparison.deltaPercent > 0 ? "+" : ""}${comparison.deltaPercent}%)`;
}
async function responseData(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Could not load purchases.");
  return data;
}
export default function SupplierPanel({ actor }: { actor: string }) {
  const [data, setData] = useState<SupplierData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [invoiceJson, setInvoiceJson] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/stock/suppliers", { cache: "no-store", signal: controller.signal }).then(responseData).then(setData).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load purchases."); });
    return () => controller.abort();
  }, []);
  async function refresh() { setData(await responseData(await fetch("/api/stock/suppliers", { cache: "no-store" }))); }
  async function save(action: "supplier" | "invoice", payload: Record<string, unknown>) {
    if (!actor.trim()) { setError("Enter your name in the stock panel before saving purchases."); return false; }
    setBusy(true); setError(""); setNotice("");
    try {
      const body = JSON.stringify({ ...payload, action, actor });
      if (new TextEncoder().encode(body).byteLength > 65536) throw new Error("The import exceeds 64 KB.");
      await responseData(await fetch("/api/stock/suppliers", { method: "POST", headers: { "Content-Type": "application/json" }, body }));
      setNotice(action === "supplier" ? "Supplier confirmed and saved." : "Invoice imported. Purchases do not update stock automatically.");
      await refresh();
      return true;
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save."); return false; }
    finally { setBusy(false); }
  }
  async function saveSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget, values = new FormData(form);
    const id = String(values.get("id") ?? "").trim();
    const payload = { id, displayName: values.get("displayName"), category: values.get("category"), verifiedSender: values.get("verifiedSender"), subjectContains: values.get("subjectContains"), active: values.get("active") === "on", confirmed: values.get("confirmed") === "on", version: data?.suppliers.find(supplier => supplier.id === id)?.version ?? 0 };
    try { parseSupplier(payload); if (await save("supplier", payload)) form.reset(); }
    catch (error) { setError(error instanceof Error ? error.message : "Check the supplier details."); }
  }
  async function importInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const raw: unknown = JSON.parse(invoiceJson);
      parseInvoice(raw);
      if (await save("invoice", raw as Record<string, unknown>)) setInvoiceJson("");
    } catch (error) { setError(error instanceof SyntaxError ? "Enter valid JSON." : error instanceof Error ? error.message : "Check the invoice details."); }
  }
  const supplierName = (id: string) => data?.suppliers.find(s => s.id === id)?.displayName ?? id;
  return <section className="mt-8 min-w-0 space-y-5 rounded-2xl border border-[#dce0d4] bg-[#fffdf8] p-4 text-[#294236] sm:p-6" aria-labelledby="supplier-heading">
    <div><h2 id="supplier-heading" className="text-xl font-semibold">Purchases and suppliers</h2><p className="mt-1 text-sm text-[#637167]">Recorded food, ingredient and beverage purchases. This register does not read Gmail automatically yet.</p></div>
    {error && <p role="alert" className="rounded-lg border border-[#dbaa9c] bg-[#f9e4de] p-3 text-sm text-[#843c2f]">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-[#eef4e9] p-3 text-sm text-[#36503d]">{notice}</p>}
    {!data && !error && <p className="text-sm text-[#637167]" role="status">Loading purchases…</p>}
    {error && <button type="button" className={button} disabled={busy} onClick={() => { setError(""); refresh().catch(() => setError("Could not load purchases. Try again.")); }}>Retry loading</button>}
    {data && <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.suppliers.map(supplier => <article key={supplier.id} className="min-w-0 break-words rounded-xl border border-[#dce0d4] p-4"><h3 className="font-medium">{supplier.displayName}</h3><p className="mt-1 text-sm text-[#637167]">{categories[supplier.category]} · {supplier.active ? "Active" : "Inactive"}</p><p className="mt-2 text-xs text-[#36503d]">Confirmed supplier · {supplier.id}</p></article>)}</div>
      {!data.suppliers.length && <p className="text-sm text-[#637167]">No confirmed suppliers yet. A manager can add verified suppliers in advanced administration.</p>}
      <div><h3 className="mb-3 font-medium">Purchase price changes</h3><p className="mb-3 text-xs text-[#637167]">The latest two invoices for each supplier, SKU, unit and currency. Shipping and other fees are excluded. Units and package sizes are not converted.</p>
        {data.comparisons.length ? <>
          <div className="grid gap-3 sm:hidden">{data.comparisons.map(c => <article key={JSON.stringify([c.supplierId, c.sku, c.unit, c.currency])} className="min-w-0 break-words rounded-xl border border-[#dce0d4] p-4">
            <h4 className="font-medium">{c.description}</h4>
            <p className="mt-1 text-sm text-[#637167]">{supplierName(c.supplierId)}</p>
            <p className="mt-1 text-xs text-[#637167]">{c.sku} · {c.date} · per {c.unit}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="min-w-0"><dt className="text-xs text-[#637167]">Previous / {c.unit}</dt><dd className="mt-1">{c.previousPriceCents === null ? "No previous price" : money(c.previousPriceCents, c.currency)}</dd></div>
              <div className="min-w-0"><dt className="text-xs text-[#637167]">Latest / {c.unit}</dt><dd className="mt-1 font-semibold">{money(c.currentPriceCents, c.currency)}</dd></div>
              <div className="col-span-2 border-t border-[#dce0d4] pt-3"><dt className="text-xs text-[#637167]">Price change</dt><dd className={`mt-1 font-medium ${c.deltaCents !== null && c.deltaCents > 0 ? "text-[#8a4b20]" : "text-[#294236]"}`}>{priceChange(c)}</dd></div>
            </dl>
          </article>)}</div>
          <div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[650px] text-left text-sm"><thead className="border-b border-[#dce0d4] text-[#637167]"><tr><th className="p-2">Product / supplier</th><th className="p-2">Unit</th><th className="p-2">Previous</th><th className="p-2">Latest</th><th className="p-2">Change</th></tr></thead><tbody>{data.comparisons.map(c => <tr key={JSON.stringify([c.supplierId, c.sku, c.unit, c.currency])} className="border-b border-[#e3e6dd]"><td className="p-2">{c.description}<span className="block text-xs text-[#637167]">{supplierName(c.supplierId)} · {c.sku} · {c.date}</span></td><td className="p-2">{c.unit}</td><td className="p-2">{c.previousPriceCents === null ? "No previous price" : money(c.previousPriceCents, c.currency)}</td><td className="p-2">{money(c.currentPriceCents, c.currency)}</td><td className={`p-2 ${c.deltaCents !== null && c.deltaCents > 0 ? "text-[#8a4b20]" : "text-[#637167]"}`}>{priceChange(c)}</td></tr>)}</tbody></table></div>
        </> : <p className="text-sm text-[#637167]">No prices have been imported.</p>}
      </div>
      <div><h3 className="mb-3 font-medium">Imported invoices ({data.invoices.length})</h3>{!data.invoices.length && <p className="text-sm text-[#637167]">No invoices have been imported.</p>}<div className="space-y-2">{data.invoices.map(invoice => <details key={invoice.id} className="rounded-lg border border-[#dce0d4] p-3"><summary className="cursor-pointer text-sm">{invoice.date} · {supplierName(invoice.supplierId)} · {invoice.invoiceNumber} · {money(invoice.totalCents, invoice.currency)}</summary><ul className="mt-3 space-y-1 text-sm text-[#637167]">{invoice.lines.map((line, index) => <li key={index}>{line.description} · {line.quantity} {line.unit} × {money(line.unitPriceCents, invoice.currency)} · total {money(line.lineTotalCents, invoice.currency)}{line.kind === "expense" ? " · Fee excluded from price comparisons" : ""}</li>)}</ul></details>)}</div></div>
    </>}
    <p className="text-xs text-[#637167]">Prices are for reference. Order recommendations need recipes, ingredient stock and delivery times.</p>
    <details className="rounded-xl border border-[#dce0d4] p-4"><summary className="cursor-pointer font-medium">Advanced administration: suppliers and imports</summary>
      <p className="mt-3 text-xs text-[#637167]">For managers reviewing purchase records. Staff can read suppliers, invoices and price changes above without using the import tools.</p>
      <p className="mt-3 text-xs text-[#637167]">Check each supplier against the original email before confirming. Reusing a supplier ID updates its details if no one else has changed them. Enter the verified sender and subject filter again for every update. Exact sender addresses and Gmail message IDs are used for validation and duplicate checks; they are hidden from purchase views.</p>
      <form onSubmit={saveSupplier} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">Supplier ID<input name="id" required pattern="[a-z0-9][a-z0-9_-]*" maxLength={80} className={field} autoComplete="off" /></label>
        <label className="space-y-1 text-sm">Supplier name<input name="displayName" required maxLength={150} className={field} /></label>
        <label className="space-y-1 text-sm">Category<select name="category" className={field}>{Object.entries(categories).map(([key, value]) => <option key={key} value={key} className="bg-white">{value}</option>)}</select></label>
        <label className="space-y-1 text-sm">Verified exact sender email<input name="verifiedSender" required type="email" maxLength={254} className={field} autoComplete="off" /></label>
        <label className="space-y-1 text-sm sm:col-span-2">Subject text (for shared senders such as QuickBooks)<input name="subjectContains" maxLength={150} className={field} autoComplete="off" /><span className="block text-xs text-[#637167]">Use text that identifies this supplier and matches the email subject.</span></label>
        <label className="flex items-center gap-2 text-sm"><input name="active" type="checkbox" defaultChecked />Active supplier</label>
        <label className="flex items-center gap-2 text-sm"><input name="confirmed" type="checkbox" required />I verified the supplier and sender</label>
        <div className="sm:col-span-2"><button className={button} disabled={busy || !actor.trim()}>Save confirmed supplier</button></div>
      </form>
      <form onSubmit={importInvoice} className="mt-6 space-y-3 border-t border-[#dce0d4] pt-5">
        <label htmlFor="supplier-invoice-json" className="block text-sm font-medium">Import verified invoice JSON</label><p id="supplier-json-help" className="text-xs text-[#637167]">Use reviewed details only: supplierId, invoiceNumber, date (YYYY-MM-DD), currency (3 uppercase letters), totalCents, gmailMessageId, sender, subject and lines. Each line needs sku, description, quantity, unit, unitPriceCents and lineTotalCents. Amounts are whole cents. Supported units: lb, kg, oz, g, l, ml, each, pack, case, bag, box, gal, qt, pt, dozen. Maximum 64 KB. No email body, HTML, links or bank details.</p>
        <p className="text-xs text-[#637167]">Each line total must match quantity × unit price, rounded to cents, within one cent. The invoice total must cover the sum of all lines; a higher total can include fees that are not listed. Negative amounts, discounts and credits are not supported yet. Keep invoices that need those adjustments for manual review.</p>
        <textarea id="supplier-invoice-json" value={invoiceJson} onChange={e => setInvoiceJson(e.target.value)} required rows={8} maxLength={65536} spellCheck={false} autoComplete="off" aria-describedby="supplier-json-help" className={`${field} font-mono text-xs`} />
        <button className={button} disabled={busy || !actor.trim() || !data?.suppliers.some(s => s.active)}>Import invoice</button>
      </form>
    </details>
  </section>;
}
