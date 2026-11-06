import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { Connection, Row } from "../src/lib/stock/service";
import { SupplierService } from "../src/lib/suppliers/service";
import { parseSupplier, parseInvoice, SupplierError } from "../src/lib/suppliers/validation";
import { supplierGet, supplierPost } from "../src/lib/suppliers/access";

const supplier = { id: "flour-mill", displayName: "Flour Mill", category: "ingredient", verifiedSender: "invoices@mill.example", subjectContains: "", active: true, confirmed: true, version: 0 };
const invoice = (overrides: Record<string, unknown> = {}) => ({ supplierId: "flour-mill", invoiceNumber: "INV-1", date: "2026-10-01", currency: "USD", totalCents: 1000, gmailMessageId: "ab1234", sender: "invoices@mill.example", subject: "Invoice INV-1", lines: [{ sku: "flour", description: "Bread flour", quantity: 2, unit: "kg", unitPriceCents: 500, lineTotalCents: 1000 }], ...overrides });
async function fixture() {
  const pg = new PGlite();
  const connection = (client: Pick<PGlite, "query">): Connection => ({ query: async <T extends Row>(sql: string, params: unknown[] = []) => (await client.query<T>(sql, params)).rows });
  const service = new SupplierService({ ...connection(pg), transaction: fn => pg.transaction(tx => fn(connection(tx))) });
  await service.migrate();
  return { pg, service };
}

test("supplier registration requires explicit confirmation and food category", () => {
  assert.equal(parseSupplier(supplier).category, "ingredient");
  for (const changes of [{ category: "marketing" }, { confirmed: false }, { verifiedSender: "Name <invoices@mill.example>" }, { verifiedSender: "*@mill.example" }, { html: "<p>body</p>" }]) assert.throws(() => parseSupplier({ ...supplier, ...changes }));
  assert.throws(() => parseSupplier({ ...supplier, verifiedSender: "quickbooks@notification.intuit.com" }));
});

test("invoice schema rejects unsafe metadata, non-food goods and invalid money/units", () => {
  assert.equal(parseInvoice(invoice()).lines[0].kind, "product");
  assert.equal(parseInvoice(invoice({ lines: [{ sku: "delivery", description: "Delivery fee", quantity: 1, unit: "each", unitPriceCents: 100, lineTotalCents: 100 }] })).lines[0].kind, "expense");
  for (const changes of [{ gmailMessageId: "https://mail.example/message" }, { date: "2026-02-30" }, { totalCents: -1 }, { totalCents: 1.5 }, { currency: "US" }, { html: "body" }, { bankDetails: "123" }, { lines: [{ sku: "ads", description: "Google Ads marketing", quantity: 1, unit: "each", unitPriceCents: 20, lineTotalCents: 20 }] }, { lines: [{ sku: "x", description: "Flour", quantity: 0, unit: "kg", unitPriceCents: 20, lineTotalCents: 20 }] }]) assert.throws(() => parseInvoice(invoice(changes)));
});

test("invoice line amounts reconcile decimal quantities within one rounded cent", () => {
  const decimal = (quantity: number, unitPriceCents: number, lineTotalCents: number) => invoice({ totalCents: 2000, lines: [{ sku: "flour", description: "Bread flour", quantity, unit: "kg", unitPriceCents, lineTotalCents }] });
  assert.equal(parseInvoice(decimal(0.1, 300, 30)).lines[0].lineTotalCents, 30);
  assert.equal(parseInvoice(decimal(1.005, 100, 101)).lines[0].lineTotalCents, 101);
  assert.equal(parseInvoice(decimal(3, 101, 304)).lines[0].lineTotalCents, 304);
  assert.equal(parseInvoice(decimal(3, 101, 302)).lines[0].lineTotalCents, 302);
  assert.throws(() => parseInvoice(decimal(3, 101, 305)), /quantity.*unit price/i);
  assert.throws(() => parseInvoice(decimal(1.005, 100, 99)), /quantity.*unit price/i);
  assert.throws(() => parseInvoice(decimal(2, 100.5, 201)), /whole.*cents/i);
  assert.throws(() => parseInvoice(decimal(2, -100, -200)), /negative|non-negative/i);
  assert.throws(() => parseInvoice(decimal(2, 100, -200)), /negative|non-negative/i);
});

test("invoice total covers all product and expense lines while allowing unitemized fees", () => {
  const lines = [{ sku: "flour", description: "Bread flour", quantity: 2, unit: "kg", unitPriceCents: 500, lineTotalCents: 1000 }, { sku: "shipping", description: "Shipping fee", quantity: 1, unit: "each", unitPriceCents: 50, lineTotalCents: 50 }];
  assert.equal(parseInvoice(invoice({ totalCents: 1050, lines })).totalCents, 1050);
  assert.equal(parseInvoice(invoice({ totalCents: 1100, lines })).totalCents, 1100);
  assert.throws(() => parseInvoice(invoice({ totalCents: 1049, lines })), /total.*sum|sum.*total/i);
});

test("only registered active exact sender and matching intermediary subject import", async () => {
  const { pg, service } = await fixture();
  try {
    await assert.rejects(() => service.importInvoice(invoice(), "Owner"));
    await service.saveSupplier(supplier, "Owner");
    for (const sender of ["evil@mill.example", "Name <invoices@mill.example>", "invoices@mill.example.evil"]) await assert.rejects(() => service.importInvoice(invoice({ sender }), "Owner"));
    await service.saveSupplier({ ...supplier, version: 1, verifiedSender: "quickbooks@notification.intuit.com", subjectContains: "Flour Mill" }, "Owner");
    await assert.rejects(() => service.importInvoice(invoice({ sender: "quickbooks@notification.intuit.com" }), "Owner"));
    await service.importInvoice(invoice({ sender: "quickbooks@notification.intuit.com", subject: "Flour Mill Invoice 1" }), "Owner");
    await service.saveSupplier({ ...supplier, version: 2, active: false }, "Owner");
    await assert.rejects(() => service.importInvoice(invoice({ invoiceNumber: "INV-2", gmailMessageId: "ab5678" }), "Owner"));
    assert.equal((await service.view()).invoices.length, 1);
  } finally { await pg.close(); }
});

test("duplicate source or supplier invoice cannot overwrite records and every mutation is audited", async () => {
  const { pg, service } = await fixture();
  try {
    await service.saveSupplier(supplier, "Owner");
    await service.importInvoice(invoice(), "Owner");
    await assert.rejects(() => service.importInvoice(invoice({ gmailMessageId: "bbb123", totalCents: 1001 }), "Other"), error => error instanceof SupplierError && error.status === 409);
    await assert.rejects(() => service.importInvoice(invoice({ invoiceNumber: "INV-2" }), "Other"), error => error instanceof SupplierError && error.status === 409);
    const data = await service.view();
    assert.equal(data.invoices.length, 1);
    assert.equal(data.invoices[0].totalCents, 1000);
    const audits = (await pg.query<{ actor: string; created_at: unknown }>("select actor,created_at from stock_supplier_audit order by id")).rows;
    assert.equal(audits.length, 2); assert.equal(audits[0].actor, "Owner"); assert.ok(audits[0].created_at);
    const publicJson = JSON.stringify(data);
    for (const secret of ["verifiedSender", "sender", "subject", "gmailMessageId", "ab1234", "invoices@mill.example"]) assert.equal(publicJson.includes(secret), false);
    assert.deepEqual(Object.keys(data.suppliers[0]).sort(), ["active", "category", "displayName", "id", "verified", "version"]);
    assert.deepEqual(Object.keys(data.invoices[0]).sort(), ["currency", "date", "id", "invoiceNumber", "lines", "supplierId", "totalCents"]);
    assert.deepEqual(Object.keys(data.invoices[0].lines[0]).sort(), ["description", "kind", "lineTotalCents", "quantity", "sku", "unit", "unitPriceCents"]);
  } finally { await pg.close(); }
});

test("stale supplier confirmation cannot replace sender rules or create an audit entry", async () => {
  const { pg, service } = await fixture();
  try {
    const created = await service.saveSupplier(supplier, "Owner");
    assert.equal(created.version, 1);
    const updated = await service.saveSupplier({ ...supplier, version: 1, displayName: "Updated Flour Mill" }, "Owner");
    assert.equal(updated.version, 2);
    for (const version of [0, 1, 3]) await assert.rejects(() => service.saveSupplier({ ...supplier, version, verifiedSender: "other@mill.example", subjectContains: "Wrong filter" }, "Stale owner"), error => error instanceof SupplierError && error.status === 409);
    assert.throws(() => parseSupplier({ ...supplier, version: undefined }), /version/i);
    assert.throws(() => parseSupplier({ ...supplier, version: -1 }), /version/i);
    const stored = (await pg.query<{ verified_sender: string; subject_contains: string; version: number }>("select verified_sender,subject_contains,version from stock_suppliers where id=$1", [supplier.id])).rows[0];
    assert.deepEqual(stored, { verified_sender: "invoices@mill.example", subject_contains: "", version: 2 });
    assert.equal((await pg.query("select * from stock_supplier_audit")).rows.length, 2);
    await service.importInvoice(invoice(), "Owner");
    assert.equal((await service.view()).invoices.length, 1);
  } finally { await pg.close(); }
});

test("migration repairs legacy JSON string invoice lines once without changing purchase records", async () => {
  const { pg, service } = await fixture();
  try {
    await service.saveSupplier(supplier, "Owner");
    await service.importInvoice(invoice(), "Owner");
    await pg.query("update stock_supplier_invoices set lines=to_jsonb(lines::text)");
    assert.equal((await pg.query<{ type: string }>("select jsonb_typeof(lines) as type from stock_supplier_invoices")).rows[0].type, "string");
    await service.migrate();
    assert.equal((await pg.query<{ type: string }>("select jsonb_typeof(lines) as type from stock_supplier_invoices")).rows[0].type, "array");
    const repaired = await service.view();
    assert.equal(repaired.invoices[0].lines[0].description, "Bread flour");
    assert.equal(repaired.invoices[0].totalCents, 1000);
    await service.migrate();
    assert.deepEqual(await service.view(), repaired);
    assert.equal((await pg.query("select * from stock_supplier_audit")).rows.length, 2);
    for (const secret of ["verifiedSender", "gmailMessageId", "ab1234", "invoices@mill.example"]) assert.equal(JSON.stringify(repaired).includes(secret), false);
  } finally { await pg.close(); }
});

test("price comparisons use latest two matching SKU, unit and currency excluding fees", async () => {
  const { pg, service } = await fixture();
  try {
    await service.saveSupplier(supplier, "Owner");
    await service.importInvoice(invoice(), "Owner");
    await service.importInvoice(invoice({ date: "2026-10-03", invoiceNumber: "INV-2", gmailMessageId: "abc2", totalCents: 1250, lines: [{ sku: "flour", description: "Bread flour", quantity: 2, unit: "kg", unitPriceCents: 600, lineTotalCents: 1200 }, { sku: "delivery", description: "Shipping fee", quantity: 1, unit: "each", unitPriceCents: 50, lineTotalCents: 50 }] }), "Owner");
    await service.importInvoice(invoice({ date: "2026-10-02", invoiceNumber: "INV-3", gmailMessageId: "abc3", currency: "EUR", totalCents: 1998, lines: [{ sku: "flour", description: "Bread flour", quantity: 2, unit: "lb", unitPriceCents: 999, lineTotalCents: 1998 }] }), "Owner");
    const { comparisons } = await service.view();
    assert.equal(comparisons.length, 2);
    const kg = comparisons.find(c => c.unit === "kg")!;
    assert.equal(kg.currentPriceCents, 600); assert.equal(kg.previousPriceCents, 500); assert.equal(kg.deltaCents, 100); assert.equal(kg.deltaPercent, 20);
    assert.equal(comparisons.find(c => c.unit === "lb")!.previousPriceCents, null);
  } finally { await pg.close(); }
});

test("supplier HTTP boundary blocks unauthenticated, foreign origin, oversized and malformed writes", async () => {
  let loads = 0;
  const unavailable = async (): Promise<SupplierService> => { loads++; throw new Error("postgres://private:secret@host/db"); };
  const request = (body: string, origin = "https://dashboard.example") => new Request("https://dashboard.example/api/stock/suppliers", { method: "POST", headers: { origin, host: "dashboard.example" }, body });
  assert.equal((await supplierGet(false, unavailable)).status, 401);
  assert.equal((await supplierPost(request("{}"), false, unavailable)).status, 401);
  assert.equal((await supplierPost(request("{}", "https://evil.example"), true, unavailable)).status, 403);
  assert.equal((await supplierPost(request("x".repeat(65537)), true, unavailable)).status, 413);
  assert.equal((await supplierPost(request("é".repeat(32769)), true, unavailable)).status, 413);
  assert.equal((await supplierPost(request("not json"), true, unavailable)).status, 400);
  assert.equal((await supplierPost(request(JSON.stringify({ action: "delete" })), true, unavailable)).status, 400);
  assert.equal(loads, 0);
  const failed = await supplierGet(true, unavailable);
  assert.equal(failed.status, 503); assert.equal((await failed.text()).includes("secret"), false);
  assert.equal(failed.headers.get("cache-control"), "private, no-store");
});

test("supplier HTTP writes return minimized invoice DTO and validation messages", async () => {
  const { pg, service } = await fixture();
  const request = (body: unknown) => new Request("https://dashboard.example/api/stock/suppliers", { method: "POST", headers: { origin: "https://dashboard.example", host: "dashboard.example" }, body: JSON.stringify(body) });
  try {
    const saved = await supplierPost(request({ action: "supplier", actor: "Owner", ...supplier }), true, async () => service);
    assert.equal(saved.status, 200); assert.equal((await saved.text()).includes("invoices@"), false);
    const imported = await supplierPost(request({ action: "invoice", actor: "Owner", ...invoice() }), true, async () => service);
    assert.equal(imported.status, 200); assert.equal((await imported.text()).includes("gmailMessageId"), false);
    const duplicate = await supplierPost(request({ action: "upsertinvoice", actor: "Owner", ...invoice() }), true, async () => service);
    assert.equal(duplicate.status, 409);
    const invalid = await supplierPost(request({ action: "invoice", actor: "Owner", ...invoice({ totalCents: -1 }) }), true, async () => service);
    assert.equal(invalid.status, 400);
  } finally { await pg.close(); }
});
