import test from "node:test";
import assert from "node:assert/strict";
import { parseCatalog, parseSales } from "../src/lib/stock/feed";

test("catalogue allowlist excludes upstream internal fields from downstream DTOs", () => {
  const items = parseCatalog({ items: [{ cloverItemId: "sku", name: "Croissant", priceCents: 400, category: null, tracked: true, stock: 5, internalOnly: "private", customerEmail: "excluded@example.invalid" }] });
  assert.deepEqual(Object.keys(items[0]).sort(), ["cloverItemId", "name", "priceCents", "category", "tracked", "stock"].sort());
  assert.equal(JSON.stringify(items).includes("private"), false);
});
test("daily captures retain business fields but discard unrelated upstream payload", () => {
  const feed = parseSales({ date: "2026-11-04", timezone: "America/New_York", generatedAt: "2026-11-05T07:30:00Z", complete: true, paidOrders: 1, customerEmail: "excluded@example.invalid", items: [{ cloverItemId: "sku", name: "Croissant", unitsInStore: 2, unitsOnline: 0, unitsTotal: 2, revenueCents: 800, firstSaleAt: "08:00", lastSaleAt: "08:30", hourly: { "8": 2 }, stockEnd: 3, customerEmail: "excluded@example.invalid", refundedUnits: 1 }] }, "2026-11-04");
  assert.equal(JSON.stringify(feed).includes("excluded@example.invalid"), false);
  assert.equal((feed as unknown as { paidOrders: number }).paidOrders, 1);
});
