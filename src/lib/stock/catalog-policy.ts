/** Holiday payments belong to pickup orders, never to the daily-product sales base.
 * "Seasonal Quiche" and other ordinary seasonal counter products remain valid.
 * Other holiday products require explicit preorder metadata in a future feed.
 */
export function isPreorderCatalogItem(name: string): boolean {
  return /\bthanksgiving\b|\bpre[\s\u2010-\u2015-]?orders?\b/i.test(name.normalize("NFKC"));
}
