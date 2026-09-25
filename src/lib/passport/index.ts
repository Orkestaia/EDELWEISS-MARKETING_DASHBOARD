import "server-only";
import postgres from "postgres";
import { PassportService, type Connection, type Row } from "./service";

let instance: PassportService | undefined;
let ready: Promise<void> | undefined;
export async function passport() {
  if (!instance) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
    const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 3, idle_timeout: 20 });
    const connection = (client: typeof sql | postgres.TransactionSql): Connection => ({
      query: async <T extends Row>(statement: string, values: unknown[] = []) => await client.unsafe(statement, values as postgres.ParameterOrJSON<never>[]) as unknown as T[]
    });
    instance = new PassportService({ ...connection(sql), transaction: async fn => await sql.begin(tx => fn(connection(tx))) as Awaited<ReturnType<typeof fn>> }, (process.env.PASSPORT_PUBLIC_BASE_URL || "https://passport.edelweisspastryshop.ch").replace(/\/$/, ""), Number(process.env.DOUBLE_STAMP_THRESHOLD_CENTS ?? 4000));
  }
  ready ??= instance.migrate().catch(error => { ready = undefined; throw error; });
  await ready;
  return instance;
}
