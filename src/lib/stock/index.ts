import "server-only";
import postgres from "postgres";
import { loadStockSeed } from "./seed";
import { StockService, type Connection, type Database, type Row } from "./service";
import { stockParameters } from "./postgres-parameters";

let instance: StockService | undefined;
let ready: Promise<void> | undefined;
let database: Database | undefined;
export async function stockDatabase(): Promise<Database> {
  if (!database) {
    if (!process.env.DATABASE_URL) throw new Error("Stock database is not configured.");
    const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: true }, max: 3, idle_timeout: 20, onnotice: () => {} });
    const connection = (client: typeof sql | postgres.TransactionSql): Connection => ({
      query: async <T extends Row>(statement: string, values: unknown[] = []) => await client.unsafe(statement, stockParameters(statement,values) as postgres.ParameterOrJSON<never>[]) as unknown as T[],
    });
    database = { ...connection(sql), transaction: async fn => await sql.begin(tx => fn(connection(tx))) as Awaited<ReturnType<typeof fn>> };
  }
  return database;
}
export async function stock() {
  if (!instance) instance = new StockService(await stockDatabase());
  ready ??= instance.migrate(loadStockSeed()).catch(error => { ready = undefined; throw error; });
  await ready;
  return instance;
}
