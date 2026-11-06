export type SupplierCategory = "food" | "ingredient" | "beverage";
export type SupplierUnit = "lb" | "kg" | "oz" | "g" | "l" | "ml" | "each" | "pack" | "case" | "bag" | "box" | "gal" | "qt" | "pt" | "dozen";
export interface SupplierInput {
  id: string;
  displayName: string;
  category: SupplierCategory;
  verifiedSender: string;
  subjectContains: string;
  active: boolean;
  confirmed: true;
  version: number;
}
export interface SupplierLine {
  sku: string;
  description: string;
  quantity: number;
  unit: SupplierUnit;
  unitPriceCents: number;
  lineTotalCents: number;
  kind: "product" | "expense";
}
export interface InvoiceInput {
  supplierId: string;
  invoiceNumber: string;
  date: string;
  currency: string;
  totalCents: number;
  gmailMessageId: string;
  sender: string;
  subject: string;
  lines: SupplierLine[];
}
export interface PublicSupplier { id: string; displayName: string; category: SupplierCategory; active: boolean; verified: true; version: number }
export interface PublicInvoice { id: string; supplierId: string; invoiceNumber: string; date: string; currency: string; totalCents: number; lines: SupplierLine[] }
export interface PriceComparison {
  supplierId: string;
  sku: string;
  description: string;
  unit: SupplierUnit;
  currency: string;
  date: string;
  currentPriceCents: number;
  previousPriceCents: number | null;
  deltaCents: number | null;
  deltaPercent: number | null;
}
export interface SupplierData { persistent: boolean; suppliers: PublicSupplier[]; invoices: PublicInvoice[]; comparisons: PriceComparison[] }
