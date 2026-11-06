import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { StockService, type Connection, type Row } from "../src/lib/stock/service";
import { loadStockSeed } from "../src/lib/stock/seed";
import { WebsiteFeed } from "../src/lib/stock/feed";
import { syncStock } from "../src/lib/stock/sync";
import { maineDate } from "../src/lib/stock/domain";
import { stockParameters } from "../src/lib/stock/postgres-parameters";

async function main() {
  loadEnvConfig(process.cwd());
  if (!process.env.DATABASE_URL || !process.env.DASHBOARD_FEED_SECRET) throw new Error("Database and feed configuration are required.");
  if (!process.argv.includes("--confirm-database")) throw new Error("Use --confirm-database after checking the intended database environment.");
  const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: true }, max: 2, idle_timeout: 20, onnotice: () => {} });
  const connection = (client: typeof sql | postgres.TransactionSql): Connection => ({ query: async <T extends Row>(statement: string, values: unknown[] = []) => await client.unsafe(statement, stockParameters(statement,values) as postgres.ParameterOrJSON<never>[]) as unknown as T[] });
  const service = new StockService({ ...connection(sql), transaction: async fn => await sql.begin(tx => fn(connection(tx))) as Awaited<ReturnType<typeof fn>> });
  try {
    await service.migrate(loadStockSeed());
    const feed = new WebsiteFeed(process.env.DASHBOARD_FEED_SECRET);
    let count = 0;
    const observedFeed = { items: () => feed.items(), sales: async (date: string) => {
      const result = await feed.sales(date); count++;
      if (count === 1 || count % 10 === 0) console.log(JSON.stringify({ progress: { received: count, lastDate: date, complete: result.complete } }));
      return result;
    } };
    for (let run = 0; run < 4; run++) {
      const result = await syncStock(service, observedFeed);
      console.log(JSON.stringify({ run: run + 1, ...result }));
      if (result.status === "error") throw new Error("Stock synchronization failed.");
      if (result.status !== "partial") break;
    }
    const view = await service.view(maineDate(), true);
    console.log(JSON.stringify({ storedCompleteDays: view.snapshots.filter(s => s.complete).length, products: view.products.length, linkedProducts: view.products.filter(p => p.cloverItemId).length, pendingProductReview: view.products.filter(p => !p.cloverItemId).map(p => p.name) }));
  } finally { await sql.end(); }
}
void main().catch(() => { console.error("Stock synchronization could not finish. Check the private configuration and sync status; secrets have not been printed."); process.exitCode = 1; });
