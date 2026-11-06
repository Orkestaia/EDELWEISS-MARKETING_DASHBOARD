import { randomUUID } from "node:crypto";
import type { Connection, Database, Row } from "../stock/service";
import { parseInvoice, parseSupplier, supplierActor, SupplierError } from "./validation";
import type { PriceComparison, PublicInvoice, PublicSupplier, SupplierCategory, SupplierData, SupplierLine } from "./types";

const schema = [
  `create table if not exists stock_suppliers (
    id text primary key, display_name text not null, category text not null check(category in ('food','ingredient','beverage')),
    verified_sender text not null, subject_contains text not null default '', active boolean not null default true,
    confirmed_by text not null, confirmed_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    version integer not null default 1 check(version>0))`,
  "alter table stock_suppliers add column if not exists version integer not null default 1 check(version>0)",
  `create table if not exists stock_supplier_invoices (
    id text primary key, supplier_id text not null references stock_suppliers(id), invoice_number text not null,
    invoice_date date not null, currency text not null check(currency ~ '^[A-Z]{3}$'), total_cents bigint not null check(total_cents>=0),
    gmail_message_id text not null unique, lines jsonb not null, created_by text not null, created_at timestamptz not null default now(),
    unique(supplier_id,invoice_number))`,
  `create table if not exists stock_supplier_audit (
    id bigserial primary key, entity text not null, entity_key text not null, actor text not null,
    action text not null, created_at timestamptz not null default now())`,
];
function publicSupplier(row: Row): PublicSupplier {
  return { id: String(row.id), displayName: String(row.display_name), category: row.category as SupplierCategory, active: Boolean(row.active), verified: true, version: Number(row.version) };
}
// Reconstruct every field explicitly, including stored JSON. Never return source metadata.
function publicInvoice(row: Row): PublicInvoice {
  const lines = (row.lines as SupplierLine[]).map(v => ({ sku: v.sku, description: v.description, quantity: v.quantity, unit: v.unit, unitPriceCents: v.unitPriceCents, lineTotalCents: v.lineTotalCents, kind: v.kind }));
  return { id: String(row.id), supplierId: String(row.supplier_id), invoiceNumber: String(row.invoice_number), date: new Date(String(row.invoice_date)).toISOString().slice(0, 10), currency: String(row.currency), totalCents: Number(row.total_cents), lines };
}
export class SupplierService {
  constructor(private db: Database) {}
  async migrate() {
    await this.db.transaction(async tx => {
      await tx.query("select pg_advisory_xact_lock(7349813)");
      for (const sql of schema) await tx.query(sql);
      // Older driver versions encoded JSON parameters twice. Repair only those rows.
      await tx.query("update stock_supplier_invoices set lines=(lines #>> '{}')::jsonb where jsonb_typeof(lines)='string'");
    });
  }
  private audit(tx: Connection, entity: string, key: string, actor: string, action: string) {
    return tx.query("insert into stock_supplier_audit(entity,entity_key,actor,action) values($1,$2,$3,$4)", [entity, key, actor, action]);
  }
  async saveSupplier(raw: unknown, rawActor: string): Promise<PublicSupplier> {
    const v = parseSupplier(raw), actor = supplierActor(rawActor);
    return this.db.transaction(async tx => {
      const values = [v.id, v.displayName, v.category, v.verifiedSender, v.subjectContains, v.active, actor];
      const [row] = v.version === 0
        ? await tx.query(`insert into stock_suppliers(id,display_name,category,verified_sender,subject_contains,active,confirmed_by)
          values($1,$2,$3,$4,$5,$6,$7) on conflict(id) do nothing returning *`, values)
        : await tx.query(`update stock_suppliers set display_name=$2,category=$3,verified_sender=$4,subject_contains=$5,active=$6,
          confirmed_by=$7,confirmed_at=now(),updated_at=now(),version=version+1 where id=$1 and version=$8 returning *`, [...values, v.version]);
      if (!row) throw new SupplierError("This supplier changed or already exists. Reload and verify the current sender details before saving.", 409);
      await this.audit(tx, "supplier", v.id, actor, "confirm");
      return publicSupplier(row);
    });
  }
  async importInvoice(raw: unknown, rawActor: string): Promise<PublicInvoice> {
    const v = parseInvoice(raw), actor = supplierActor(rawActor);
    return this.db.transaction(async tx => {
      const [supplier] = await tx.query("select * from stock_suppliers where id=$1 and active for update", [v.supplierId]);
      if (!supplier || supplier.verified_sender !== v.sender || (supplier.subject_contains && !v.subject.includes(String(supplier.subject_contains)))) throw new SupplierError("The supplier, sender or subject does not match the confirmed supplier list.", 403);
      const [row] = await tx.query(`insert into stock_supplier_invoices(id,supplier_id,invoice_number,invoice_date,currency,total_cents,gmail_message_id,lines,created_by)
        values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) on conflict do nothing returning *`,
      [randomUUID(), v.supplierId, v.invoiceNumber, v.date, v.currency, v.totalCents, v.gmailMessageId, JSON.stringify(v.lines), actor]);
      if (!row) throw new SupplierError("This invoice or source message was already imported. No changes were made.", 409);
      await this.audit(tx, "invoice", String(row.id), actor, "import");
      return publicInvoice(row);
    });
  }
  async view(): Promise<SupplierData> {
    const [suppliers, invoiceRows] = await Promise.all([
      this.db.query("select id,display_name,category,active,version from stock_suppliers order by display_name,id"),
      this.db.query("select id,supplier_id,invoice_number,invoice_date,currency,total_cents,lines from stock_supplier_invoices order by invoice_date desc,created_at desc,id desc"),
    ]);
    const invoices = invoiceRows.map(publicInvoice), groups = new Map<string, { invoice: PublicInvoice; line: SupplierLine }[]>();
    for (const invoice of invoices) for (const line of invoice.lines) {
      if (line.kind !== "product") continue;
      const key = JSON.stringify([invoice.supplierId, line.sku, line.unit, invoice.currency]);
      const group = groups.get(key) ?? [];
      if (group.length < 2) group.push({ invoice, line });
      groups.set(key, group);
    }
    const comparisons: PriceComparison[] = Array.from(groups.values(), ([current, previous]) => {
      const previousPriceCents = previous?.line.unitPriceCents ?? null;
      const deltaCents = previousPriceCents === null ? null : current.line.unitPriceCents - previousPriceCents;
      return { supplierId: current.invoice.supplierId, sku: current.line.sku, description: current.line.description, unit: current.line.unit, currency: current.invoice.currency, date: current.invoice.date, currentPriceCents: current.line.unitPriceCents, previousPriceCents, deltaCents, deltaPercent: previousPriceCents && deltaCents !== null ? Math.round(deltaCents / previousPriceCents * 10000) / 100 : null };
    });
    return { persistent: true, suppliers: suppliers.map(publicSupplier), invoices, comparisons };
  }
}
