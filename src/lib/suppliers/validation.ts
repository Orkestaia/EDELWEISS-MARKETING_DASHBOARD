import type { InvoiceInput, SupplierCategory, SupplierInput, SupplierLine, SupplierUnit } from "./types";

export class SupplierError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
function record(raw: unknown, keys: string[]) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SupplierError("Enter a valid object.");
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).some(key => !keys.includes(key))) throw new SupplierError("Remove unsupported fields. Only purchase details are allowed.");
  return value;
}
function text(raw: unknown, label: string, max = 150, empty = false) {
  if (typeof raw !== "string" || raw.length > max || /[<>\u0000-\u001f\u007f]|(?:https?:\/\/|www\.)/i.test(raw)) throw new SupplierError(`${label}: enter valid text without HTML or links.`);
  const value = raw.normalize("NFC").trim();
  if (!value && !empty) throw new SupplierError(`${label} is required.`);
  return value;
}
function email(raw: unknown) {
  const value = text(raw, "Sender", 254);
  if (!/^[a-zA-Z0-9.!#$%&'+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/.test(value) || value.includes("*") || value.includes("..")) throw new SupplierError("Enter the exact sender email, without a display name or wildcards.");
  return value;
}
function identifier(raw: unknown) {
  const value = text(raw, "Supplier ID", 80);
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(value)) throw new SupplierError("The supplier ID only allows lowercase letters, numbers, hyphens and underscores.");
  return value;
}
function cents(raw: unknown) {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0 || raw > 1_000_000_000) throw new SupplierError("Amounts must be non-negative whole cents, up to 1,000,000,000. Negative discounts and credits are not supported yet.");
  return raw;
}
export function supplierActor(raw: unknown) { return text(raw, "Staff name", 80); }
export function parseSupplier(raw: unknown): SupplierInput {
  const v = record(raw, ["id", "displayName", "category", "verifiedSender", "subjectContains", "active", "confirmed", "version"]);
  if (typeof v.version !== "number" || !Number.isSafeInteger(v.version) || v.version < 0 || v.version > 2147483646) throw new SupplierError("Supplier version must be a non-negative whole number. Reload before confirming an existing supplier.");
  if (!["food", "ingredient", "beverage"].includes(String(v.category))) throw new SupplierError("Only food, ingredient and beverage suppliers are allowed.");
  if (v.confirmed !== true) throw new SupplierError("Confirm that you verified the supplier and sender.");
  if (typeof v.active !== "boolean") throw new SupplierError("Choose whether the supplier is active.");
  const verifiedSender = email(v.verifiedSender), subjectContains = text(v.subjectContains ?? "", "Subject filter", 150, true);
  if (/(?:^|[.@-])(?:intuit|quickbooks|bill|stripe|squareup)\.(?:com|net)$/i.test(verifiedSender) && !subjectContains) throw new SupplierError("A shared sender requires a subject filter that identifies this supplier.");
  return { id: identifier(v.id), displayName: text(v.displayName, "Supplier name"), category: v.category as SupplierCategory, verifiedSender, subjectContains, active: v.active, confirmed: true, version: v.version };
}
const units = new Set(["lb", "kg", "oz", "g", "l", "ml", "each", "pack", "case", "bag", "box", "gal", "qt", "pt", "dozen"]);
function roundedLineCents(quantity: number, unitPriceCents: number): bigint {
  // Decimal arithmetic avoids binary floating-point errors at half-cent boundaries.
  const [coefficient, exponent = "0"] = quantity.toString().toLowerCase().split("e");
  const [whole, fraction = ""] = coefficient.split(".");
  const scale = fraction.length - Number(exponent);
  let numerator = BigInt(whole + fraction) * BigInt(unitPriceCents);
  const denominator = scale > 0 ? BigInt(10) ** BigInt(scale) : BigInt(1);
  if (scale < 0) numerator *= BigInt(10) ** BigInt(-scale);
  return (numerator + denominator / BigInt(2)) / denominator;
}
function line(raw: unknown): SupplierLine {
  const v = record(raw, ["sku", "description", "quantity", "unit", "unitPriceCents", "lineTotalCents"]);
  const sku = text(v.sku, "SKU", 100), description = text(v.description, "Description", 300);
  const words = `${sku} ${description}`.toLowerCase();
  if (/\b(marketing|advertis(?:ing|ement)?|google ads|meta ads|facebook ads|seo|software|subscription|cleaning|detergent|equipment|printer|paper towels|servilletas|limpieza|publicidad|maquinaria)\b/.test(words)) throw new SupplierError("The invoice includes items outside food, ingredients or beverages.");
  if (typeof v.quantity !== "number" || !Number.isFinite(v.quantity) || v.quantity <= 0 || v.quantity > 1_000_000) throw new SupplierError("Quantity must be positive and no greater than 1,000,000.");
  if (typeof v.unit !== "string" || !units.has(v.unit)) throw new SupplierError("Choose an explicit supported unit.");
  const unitPriceCents = cents(v.unitPriceCents), lineTotalCents = cents(v.lineTotalCents);
  const difference = roundedLineCents(v.quantity, unitPriceCents) - BigInt(lineTotalCents);
  if (difference > BigInt(1) || difference < BigInt(-1)) throw new SupplierError("Each line total must match quantity times unit price, rounded to cents, within one cent.");
  const kind = /\b(fees?|shipping|delivery|freight|tax(?:es)?|deposit|handling|service charge|portes|env[ií]o|impuesto|recargo|descuento|discount)\b/.test(words) ? "expense" : "product";
  return { sku, description, quantity: v.quantity, unit: v.unit as SupplierUnit, unitPriceCents, lineTotalCents, kind };
}
export function parseInvoice(raw: unknown): InvoiceInput {
  const v = record(raw, ["supplierId", "invoiceNumber", "date", "currency", "totalCents", "gmailMessageId", "sender", "subject", "lines"]);
  const date = text(v.date, "Date", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new SupplierError("Enter a valid date in YYYY-MM-DD format.");
  if (typeof v.currency !== "string" || !/^[A-Z]{3}$/.test(v.currency)) throw new SupplierError("Currency must be three uppercase letters.");
  if (typeof v.gmailMessageId !== "string" || !/^[a-f0-9]{1,64}$/i.test(v.gmailMessageId)) throw new SupplierError("The source message ID must be hexadecimal.");
  if (!Array.isArray(v.lines) || v.lines.length === 0 || v.lines.length > 150) throw new SupplierError("Enter between 1 and 150 invoice lines.");
  const lines = v.lines.map(line), products = new Set<string>();
  for (const item of lines) {
    const key = JSON.stringify([item.sku, item.unit]);
    if (item.kind === "product" && products.has(key)) throw new SupplierError("Combine each product SKU and unit into one line per invoice.");
    if (item.kind === "product") products.add(key);
  }
  const totalCents = cents(v.totalCents);
  if (lines.reduce((sum, item) => sum + item.lineTotalCents, 0) > totalCents) throw new SupplierError("The invoice total cannot be less than the sum of its lines. Negative discounts and credits are not supported yet.");
  return { supplierId: identifier(v.supplierId), invoiceNumber: text(v.invoiceNumber, "Invoice number", 100), date, currency: v.currency, totalCents, gmailMessageId: v.gmailMessageId.toLowerCase(), sender: email(v.sender), subject: text(v.subject, "Subject", 250), lines };
}
