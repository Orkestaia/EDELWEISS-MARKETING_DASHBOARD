import { randomUUID } from "node:crypto";
import { stockSchema } from "./schema";
import { dateKey, largeOverride, maineDate, monday, quantity, reasonText, shiftDate, staffName, StockError, validateClose, version, weekday } from "./domain";
import { parseCatalog, parseSales } from "./feed";
import type { CatalogItem, CloseEntry, PlanEntry, Product, SalesFeed, StockData } from "./types";

export type Row = Record<string, unknown>;
export interface Connection { query<T extends Row = Row>(sql: string, values?: unknown[]): Promise<T[]> }
export interface Database extends Connection { transaction<T>(fn: (tx: Connection) => Promise<T>): Promise<T> }
const iso = (v: unknown) => new Date(String(v)).toISOString();
const day = (v: unknown) => iso(v).slice(0, 10);
const clock = (v: unknown) => v == null ? null : String(v).slice(0, 5);
const productRow = (r: Row): Product => ({ key: String(r.product_key), name: String(r.display_name), family: r.family as Product["family"], pars: [r.par_mon, r.par_tue, r.par_wed, r.par_thu, r.par_fri, r.par_sat, r.par_sun].map(Number), cloverItemId: r.clover_item_id == null ? null : String(r.clover_item_id), mappingNote: String(r.mapping_note), version: Number(r.version) });
const normalized = (name: string) => name.normalize("NFC").trim().toLowerCase();
export class StockService {
  constructor(private db: Database) {}
  async migrate(seed: Product[]) {
    await this.db.transaction(async tx => {
      // Serialize first-run migrations across workers and concurrent requests.
      await tx.query("select pg_advisory_xact_lock(7349812)");
      for (const sql of stockSchema) await tx.query(sql);
      for (const p of seed) await tx.query(`insert into plan_products
        (product_key,display_name,family,par_mon,par_tue,par_wed,par_thu,par_fri,par_sat,par_sun,mapping_note)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict (product_key) do nothing`, [p.key, p.name, p.family, ...p.pars, p.mappingNote]);
    });
  }
  async view(requested: string, feedConfigured: boolean, now = new Date()): Promise<StockData> {
    const week = monday(dateKey(requested)), end = shiftDate(week, 6), today = maineDate(now);
    const [products, plans, closes, snapshots, sales, catalog, runs] = await Promise.all([
      this.db.query("select * from plan_products where active order by family,display_name"),
      this.db.query("select * from plan_days where date between $1 and $2", [week, end]),
      this.db.query("select * from daily_close where date between $1 and $2", [week, end]),
      this.db.query("select date,complete,generated_at,payload from stock_feed_days where date >= $1 order by date desc", [shiftDate(today, -90)]),
      this.db.query("select * from daily_sales where date between $1 and $2", [week, end]),
      this.db.query("select payload from stock_catalog order by clover_item_id"),
      this.db.query("select status,message,created_at from stock_sync_runs order by id desc limit 1"),
    ]);
    const mapped = new Set(products.filter(p => p.clover_item_id != null).map(p => p.clover_item_id));
    return {
      today, week, persistent: true, feedConfigured, products: products.map(productRow),
      plans: plans.map((r): PlanEntry => ({ date: day(r.date), productKey: String(r.product_key), planned: Number(r.planned), baseline: Number(r.suggested) + ((r.explain as {forecast?:boolean;preorders?:number})?.forecast ? Number((r.explain as {preorders?:number}).preorders??0):0), reason: String(r.override_reason ?? ""), version: Number(r.version) })),
      closes: closes.map((r): CloseEntry => ({ date: day(r.date), productKey: String(r.product_key), baked: r.baked == null ? null : Number(r.baked), leftover: r.leftover == null ? null : Number(r.leftover), tgtg: Number(r.tgtg), reused: Number(r.reused), discarded: Number(r.discarded), soldOut: Boolean(r.sold_out), soldOutAt: clock(r.sold_out_at), enteredBy: String(r.entered_by), enteredAt: iso(r.entered_at), status: r.status as CloseEntry["status"], version: Number(r.version) })),
      snapshots: snapshots.map(r => ({ date: day(r.date), complete: Boolean(r.complete), generatedAt: iso(r.generated_at), unmapped: (r.payload as SalesFeed).items.filter(i => !mapped.has(i.cloverItemId)).length })),
      sales: sales.map(r => ({ date: day(r.date), productKey: String(r.product_key), units: Number(r.units_in_store) + Number(r.units_online), stockEnd: r.stock_end == null ? null : Number(r.stock_end), lastSaleAt: clock(r.last_sale_at) })),
      catalog: parseCatalog({ items: catalog.map(r => r.payload) }),
      sync: runs[0] ? { status: String(runs[0].status), message: String(runs[0].message), at: iso(runs[0].created_at) } : null,
    };
  }
  private async product(tx: Connection, key: unknown) {
    if (typeof key !== "string" || key.length > 100) throw new StockError("Choose a product.");
    const [p] = await tx.query("select * from plan_products where product_key=$1 and active for update", [key]);
    if (!p) throw new StockError("Product not found.", 404);
    return productRow(p);
  }
  private async audit(tx: Connection, entity: string, key: string, actor: string, payload: unknown) {
    await tx.query("insert into stock_audit(entity,entity_key,actor,payload) values ($1,$2,$3,$4::jsonb)", [entity, key, actor, JSON.stringify(payload)]);
  }
  async savePlan(body: Record<string, unknown>) {
    const date = dateKey(body.date), planned = quantity(body.planned), expected = version(body.version), actor = staffName(body.actor), reason = reasonText(body.reason);
    return this.db.transaction(async tx => {
      const p = await this.product(tx, body.productKey);
      const [previous] = await tx.query("select * from plan_days where date=$1 and product_key=$2", [date, p.key]);
      if (Number(previous?.version ?? 0) !== expected) throw new StockError("Someone changed this plan. Reload to review their changes.", 409);
      const baseline = previous ? Number(previous.suggested) + ((previous.explain as {forecast?:boolean;preorders?:number})?.forecast ? Number((previous.explain as {preorders?:number}).preorders??0):0) : p.pars[weekday(date)];
      if (largeOverride(planned, baseline) && !reason) throw new StockError("Add a reason for a change greater than 20% of the manual par.");
      const next = expected + 1;
      await tx.query(`insert into plan_days(date,product_key,suggested,planned,override_reason,explain,created_by,version)
        values($1,$2,$3,$4,$5,$6::jsonb,$7,$8) on conflict(date,product_key) do update set planned=excluded.planned,override_reason=excluded.override_reason,created_by=excluded.created_by,version=excluded.version`,
        [date, p.key, baseline, planned, reason, JSON.stringify({ method: "manual-par", base: baseline, forecast: false, preordersIncluded: false }), actor, next]);
      await this.audit(tx, "plan", `${date}/${p.key}`, actor, { before: previous ?? null, planned, reason, version: next });
      return { date, productKey: p.key, planned, baseline, reason, version: next };
    });
  }
  async saveClose(body: Record<string, unknown>, now = new Date()) {
    const date = dateKey(body.date), expected = version(body.version), actor = staffName(body.actor);
    if (date > maineDate(now)) throw new StockError("Production can only be recorded for today or an earlier day.");
    if (body.status !== "draft" && body.status !== "closed") throw new StockError("Choose draft or closed.");
    const values = validateClose(body, body.status === "closed");
    return this.db.transaction(async tx => {
      const p = await this.product(tx, body.productKey);
      const [previous] = await tx.query("select * from daily_close where date=$1 and product_key=$2", [date, p.key]);
      if (Number(previous?.version ?? 0) !== expected) throw new StockError("Someone changed this count. Reload to review their changes.", 409);
      const next = expected + 1;
      await tx.query(`insert into daily_close(date,product_key,baked,leftover,tgtg,reused,discarded,sold_out,sold_out_at,entered_by,status,version)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict(date,product_key) do update set baked=excluded.baked,leftover=excluded.leftover,tgtg=excluded.tgtg,reused=excluded.reused,discarded=excluded.discarded,sold_out=excluded.sold_out,sold_out_at=excluded.sold_out_at,entered_by=excluded.entered_by,entered_at=now(),status=excluded.status,version=excluded.version`,
        [date, p.key, values.baked, values.leftover, values.tgtg, values.reused, values.discarded, values.soldOut, values.soldOutAt, actor, body.status, next]);
      await this.audit(tx, "close", `${date}/${p.key}`, actor, { before: previous ?? null, ...values, status: body.status, version: next });
      return { date, productKey: p.key, ...values, status: body.status, enteredBy: actor, enteredAt: new Date().toISOString(), version: next } as CloseEntry;
    });
  }
  async saveProduct(body: Record<string, unknown>) {
    const expected = version(body.version), actor = staffName(body.actor);
    if (!Array.isArray(body.pars) || body.pars.length !== 7) throw new StockError("Enter all seven manual quantities.");
    const pars = body.pars.map(quantity);
    if (!(body.cloverItemId === null || typeof body.cloverItemId === "string")) throw new StockError("Choose a catalogue item.");
    return this.db.transaction(async tx => {
      await tx.query("select pg_advisory_xact_lock(7349813)");
      const p = await this.product(tx, body.productKey);
      if (p.version !== expected) throw new StockError("Someone changed this product. Reload first.", 409);
      if (body.cloverItemId) {
        const items = await tx.query("select clover_item_id from stock_catalog where clover_item_id=$1", [body.cloverItemId]);
        if (!items.length) throw new StockError("Choose an item from the synced catalogue.");
        const owners = await tx.query("select product_key from plan_products where clover_item_id=$1 and product_key<>$2", [body.cloverItemId, p.key]);
        if (owners.length) throw new StockError("This Clover item is already linked to another product.", 409);
      }
      // Explicit review is required before confirming the two guessed CSV mappings.
      const note = body.confirmMapping === true ? "" : p.mappingNote;
      await tx.query("update plan_products set par_mon=$2,par_tue=$3,par_wed=$4,par_thu=$5,par_fri=$6,par_sat=$7,par_sun=$8,clover_item_id=$9,mapping_note=$10,version=version+1 where product_key=$1", [p.key, ...pars, body.cloverItemId || null, note]);
      await this.audit(tx, "product", p.key, actor, { before: p, pars, cloverItemId: body.cloverItemId, mappingNote: note });
      if (p.cloverItemId !== body.cloverItemId) {
        const days = await tx.query("select payload from stock_feed_days order by date");
        for (const r of days) await this.writeSales(tx, r.payload as SalesFeed);
      }
      return { ...p, pars, cloverItemId: (body.cloverItemId || null) as string | null, mappingNote: note, version: p.version + 1 };
    });
  }
  async saveCatalog(raw: CatalogItem[]) {
    const items = parseCatalog({ items: raw });
    await this.db.transaction(async tx => {
      await tx.query("select pg_advisory_xact_lock(7349813)");
      for (const item of items) await tx.query("insert into stock_catalog(clover_item_id,payload) values($1,$2::jsonb) on conflict(clover_item_id) do update set payload=excluded.payload", [item.cloverItemId, JSON.stringify(item)]);
      const products = await tx.query("select * from plan_products where clover_item_id is null and mapping_note='' order by product_key for update");
      let newlyMapped = false;
      for (const row of products) {
        const matches = items.filter(i => normalized(i.name) === normalized(String(row.display_name)));
        if (matches.length === 1) {
          const updated = await tx.query("update plan_products set clover_item_id=$2,price_cents=$3,version=version+1 where product_key=$1 and not exists(select 1 from plan_products where clover_item_id=$2) returning product_key", [row.product_key, matches[0].cloverItemId, matches[0].priceCents]);
          newlyMapped ||= updated.length > 0;
        }
      }
      if (newlyMapped) for (const row of await tx.query("select payload from stock_feed_days order by date")) await this.writeSales(tx, row.payload as SalesFeed);
    });
  }
  private async writeSales(tx: Connection, feed: SalesFeed) {
    await tx.query("delete from daily_sales where date=$1", [feed.date]);
    await tx.query(`insert into daily_sales(date,product_key,units_in_store,units_online,revenue_cents,first_sale_at,last_sale_at,hourly,stock_end)
      select $1,p.product_key,i."unitsInStore",i."unitsOnline",i."revenueCents",i."firstSaleAt",i."lastSaleAt",i.hourly,i."stockEnd"
      from jsonb_to_recordset($2::jsonb) as i("cloverItemId" text,"unitsInStore" numeric,"unitsOnline" numeric,"revenueCents" bigint,"firstSaleAt" time,"lastSaleAt" time,hourly jsonb,"stockEnd" integer)
      join plan_products p on p.clover_item_id=i."cloverItemId"`,[feed.date,JSON.stringify(feed.items)]);
  }
  async saveSnapshot(raw: SalesFeed) {
    const feed = parseSales(raw, raw.date);
    return this.db.transaction(async tx => {
      await tx.query("select pg_advisory_xact_lock(7349813)");
      const rows = await tx.query(`insert into stock_feed_days(date,complete,generated_at,payload) values($1,$2,$3,$4::jsonb)
        on conflict(date) do update set complete=excluded.complete,generated_at=excluded.generated_at,payload=excluded.payload,received_at=now()
        where excluded.generated_at >= stock_feed_days.generated_at and (not stock_feed_days.complete or excluded.complete) returning date`, [feed.date, feed.complete, feed.generatedAt, JSON.stringify(feed)]);
      if (!rows.length) return false;
      await this.writeSales(tx, feed);
      return true;
    });
  }
  async missingDates(today: string) {
    const rows = await this.db.query("select date from stock_feed_days where complete and date between $1 and $2", [shiftDate(today, -90), shiftDate(today, -1)]);
    const complete = new Set(rows.map(r => day(r.date)));
    return Array.from({ length: 90 }, (_, i) => shiftDate(today, -i - 1)).filter(d => !complete.has(d));
  }
  async logSync(status: string, message: string) {
    await this.db.query("insert into stock_sync_runs(status,message) values($1,$2)", [status, message]);
  }
  async acquireSync() {
    const token = randomUUID();
    const rows = await this.db.query(`insert into stock_sync_lock(id,token,expires_at) values(1,$1,now()+interval '5 minutes')
      on conflict(id) do update set token=excluded.token,expires_at=excluded.expires_at where stock_sync_lock.expires_at < now() returning token`, [token]);
    return rows.length ? token : null;
  }
  async releaseSync(token: string) { await this.db.query("delete from stock_sync_lock where id=1 and token=$1", [token]); }
}
