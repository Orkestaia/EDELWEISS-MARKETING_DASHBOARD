export const FAMILIES = ["laminated", "bread", "pastry", "cookie", "cake", "savory", "seasonal"] as const;
export type Family = typeof FAMILIES[number];
export interface Product {
  key: string; name: string; family: Family; pars: number[];
  cloverItemId: string | null; mappingNote: string; version: number;
}
export interface CatalogItem {
  cloverItemId: string; name: string; priceCents: number; category: string | null;
  tracked: boolean; stock: number | null;
}
export interface SalesItem {
  cloverItemId: string | null; name: string; unitsInStore: number; unitsOnline: number;
  unitsTotal: number; revenueCents: number; firstSaleAt: string | null;
  lastSaleAt: string | null; hourly: Record<string, number>; stockEnd: number | null;
  refundedUnits?: number;
}
export interface SalesFeed {
  date: string; timezone: "America/New_York"; generatedAt: string; complete: boolean; items: SalesItem[];
  orders?: number; paidOrders?: number;
}
export interface PlanEntry {
  date: string; productKey: string; planned: number; baseline: number; reason: string; version: number;
}
export interface CloseValues {
  baked: number | null; leftover: number | null; tgtg: number; reused: number;
  discarded: number; soldOut: boolean; soldOutAt: string | null;
}
export interface CloseEntry extends CloseValues {
  date: string; productKey: string; status: "draft" | "closed"; version: number;
  enteredBy: string; enteredAt: string;
}
export interface StockData {
  today: string; week: string; persistent: boolean; feedConfigured: boolean;
  products: Product[]; plans: PlanEntry[]; closes: CloseEntry[]; catalog: CatalogItem[];
  snapshots: { date: string; complete: boolean; generatedAt: string; unmapped: number }[];
  sales: { date: string; productKey: string; units: number; stockEnd: number | null; lastSaleAt: string | null }[];
  sync: { status: string; message: string; at: string } | null;
}
