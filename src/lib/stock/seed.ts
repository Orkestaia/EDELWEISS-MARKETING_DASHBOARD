import { readFileSync } from "node:fs";
import { join } from "node:path";
import Papa from "papaparse";
import { FAMILIES, type Family, type Product } from "./types";
import { quantity } from "./domain";

export function loadStockSeed(): Product[] {
  const parsed = Papa.parse<Record<string, string>>(readFileSync(join(process.cwd(), "docs", "stock-par-seed.csv"), "utf8"), { header: true, skipEmptyLines: true });
  if (parsed.errors.length) throw new Error("Invalid stock seed CSV");
  const products = parsed.data.map(row => {
    if (!row.web_product_name || !FAMILIES.includes(row.family as Family)) throw new Error("Invalid stock seed product");
    return {
      key: row.excel_name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      name: row.web_product_name, family: row.family as Family,
      pars: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map(day => quantity(Number(row[day]))),
      cloverItemId: null, mappingNote: row.mapping_note ?? "", version: 0,
    };
  });
  if (new Set(products.map(p => p.key)).size !== products.length) throw new Error("Duplicate stock seed keys");
  return products;
}
