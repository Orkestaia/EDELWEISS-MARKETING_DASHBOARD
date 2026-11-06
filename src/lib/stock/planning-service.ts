import { createHash, randomUUID } from "node:crypto";
import { calculatePlan } from "./planning";
import type { PlanningEvent, PlanningSettings } from "./planning-types";
import type { CatalogItem, PlanEntry } from "./types";
import { FAMILIES } from "./types";
import type { Connection, Database, Row } from "./service";
import { dateKey, largeOverride, quantity, reasonText, shiftDate, staffName, StockError, version, weekday } from "./domain";

export interface PreorderProduct { key: string; name: string; cloverItemId: string | null }
export interface PreorderResult { quantities: Record<string, number>; status: { available: boolean; message: string; unmapped: number } }
export type PreorderLoader = (date: string, products: PreorderProduct[], catalog: CatalogItem[]) => Promise<PreorderResult>;
const defaults: PlanningSettings = { baseWeeks: 4, censorCap: 1.6, closingTime: "14:00" };
const isoDay = (value: unknown) => new Date(String(value)).toISOString().slice(0, 10);
const time = (value: unknown) => value == null ? null : String(value).slice(0, 5);
function clock(value: unknown) { if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new StockError("Choose a valid time."); return value; }
function decimal(value: unknown, min: number, max: number) { if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new StockError(`Use a number from ${min} to ${max}.`); return value; }
function config(value: unknown): PlanningSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new StockError("Check the planning settings.");
  const v = value as Record<string, unknown>, baseWeeks = quantity(v.baseWeeks);
  if (baseWeeks < 1 || baseWeeks > 12) throw new StockError("Use between 1 and 12 base weeks.");
  return { baseWeeks, censorCap: decimal(v.censorCap, 1, 3), closingTime: clock(v.closingTime) };
}
export class PlanningService {
  constructor(private db: Database, private loadPreorders: PreorderLoader) {}
  async migrate() {
    await this.db.transaction(async tx => {
      await tx.query("select pg_advisory_xact_lock(7349814)");
      await tx.query("create table if not exists plan_settings(key text primary key,value jsonb not null,version integer not null default 1)");
      await tx.query(`create table if not exists plan_events(id text primary key,date_from date not null,date_to date not null,name text not null,
        factor numeric not null check(factor>=0 and factor<=5),scope text not null,scope_value text,closed boolean not null default false,note text not null default '',version integer not null default 1,check(date_to>=date_from))`);
      await tx.query("insert into plan_settings(key,value) values('forecast',$1::jsonb) on conflict(key) do nothing", [JSON.stringify(defaults)]);
      await tx.query("update plan_settings set value=(value #>> '{}')::jsonb where jsonb_typeof(value)='string'");
    });
  }
  private async context(date: string, tx: Connection = this.db) {
    const [products, sales, closes, events, settings, plans, catalog] = await Promise.all([
      tx.query("select * from plan_products where active order by family,display_name"),
      tx.query("select s.* from daily_sales s join stock_feed_days f on f.date=s.date where f.complete and s.date >= $1 and s.date < $2", [shiftDate(date, -400), date]),
      tx.query("select * from daily_close where date >= $1 and date < $2", [shiftDate(date, -400), date]),
      tx.query("select * from plan_events where date_from <= $1 and date_to >= $2 order by date_from,id", [date, shiftDate(date, -400)]),
      tx.query("select value,version from plan_settings where key='forecast'"),
      tx.query("select * from plan_days where date=$1", [date]),
      tx.query("select payload from stock_catalog"),
    ]);
    return { products, sales, closes, events, settings: config(settings[0]?.value ?? defaults), plans, catalog: catalog.map(r => r.payload as CatalogItem) };
  }
  private event(r: Row): PlanningEvent & { version: number } { return { id: String(r.id), dateFrom: isoDay(r.date_from), dateTo: isoDay(r.date_to), name: String(r.name), factor: Number(r.factor), scope: r.scope as PlanningEvent["scope"], scopeValue: r.scope_value == null ? null : String(r.scope_value), closed: Boolean(r.closed), version: Number(r.version) }; }
  private async generate(date: string, tx: Connection, preorders?: PreorderResult) {
    const c = await this.context(date, tx);
    const fingerprint=createHash("sha256").update(JSON.stringify({products:c.products.map(p=>[p.product_key,p.display_name,p.clover_item_id,p.version]),catalog:c.catalog.map(p=>[p.cloverItemId,p.name]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))})).digest("hex");
    const source = preorders ?? await this.loadPreorders(date, c.products.map(p => ({ key: String(p.product_key), name: String(p.display_name), cloverItemId: p.clover_item_id == null ? null : String(p.clover_item_id) })), c.catalog);
    const rows = c.products.map(p => {
      const productKey = String(p.product_key), pars = [p.par_mon,p.par_tue,p.par_wed,p.par_thu,p.par_fri,p.par_sat,p.par_sun].map(Number);
      const history = c.sales.filter(s => s.product_key === productKey);
      const valid = history.filter(s => Number(s.units_in_store) + Number(s.units_online) >= 0 && Object.values(s.hourly as Record<string,number>).every(n => n >= 0));
      const result = calculatePlan({ date, product: { key: productKey, family: p.family as typeof FAMILIES[number], pars, unitsPerTray: Number(p.units_per_tray), bufferK: Number(p.buffer_k), targetSelloutTime: time(p.target_sellout_time)! },
        sales: valid.map(s => ({ date: isoDay(s.date), units: Number(s.units_in_store) + Number(s.units_online), hourly: s.hourly as Record<string,number>, complete: true })),
        closes: c.closes.filter(s => s.product_key === productKey).map(s => ({ date: isoDay(s.date), baked: s.baked == null ? null : Number(s.baked), leftover: s.leftover == null ? null : Number(s.leftover), soldOut: Boolean(s.sold_out), soldOutAt: time(s.sold_out_at), status: s.status as "draft"|"closed" })),
        events: c.events.map(e => this.event(e)), settings: c.settings, preorders: quantity(source.quantities[productKey] ?? 0) });
      if (valid.length !== history.length) result.explain.warnings.push("Days with negative refund adjustments were excluded from demand estimation; the original sales ledger is preserved.");
      if (!source.status.available || source.status.unmapped) result.explain.warnings.push(source.status.message);
      const previous = c.plans.find(r => r.product_key === productKey);
      return { productKey, name: String(p.display_name), family: String(p.family), manualPar: pars[weekday(date)], unitsPerTray: Number(p.units_per_tray), ...result,
        existingPlan: previous ? { planned: Number(previous.planned), baseline: Number(previous.suggested), reason: String(previous.override_reason ?? ""), version: Number(previous.version) } : null };
    });
    return { date, rows, preordersStatus: source.status, persistent: true, source, fingerprint };
  }
  async preview(rawDate: string) { const { source: _source, fingerprint:_fingerprint, ...view } = await this.generate(dateKey(rawDate), this.db); void _source;void _fingerprint; return view; }
  async apply(body: Record<string,unknown>): Promise<PlanEntry> {
    const date = dateKey(body.date), actor = staffName(body.actor), planned = quantity(body.planned), expected = version(body.version), reason = reasonText(body.reason);
    const initial = await this.generate(date,this.db);
    if (!initial.preordersStatus.available || initial.preordersStatus.unmapped) throw new StockError("Confirm pickup orders before accepting a recommendation. The source has pending orders or could not be read.", 409);
    return this.db.transaction(async tx => {
      await tx.query("select pg_advisory_xact_lock(7349813)"); await tx.query("select pg_advisory_xact_lock(7349814)");
      const [product] = await tx.query("select product_key from plan_products where product_key=$1 and active for update", [body.productKey]);
      if (!product) throw new StockError("Product not found.",404);
      const preview = await this.generate(date,tx,initial.source), row = preview.rows.find(r=>r.productKey===product.product_key)!;
      if(preview.fingerprint!==initial.fingerprint)throw new StockError("Product links or parameters changed while pickup orders were loading. Reload before saving.",409);
      if ((row.existingPlan?.version ?? 0) !== expected) throw new StockError("Someone changed this plan. Reload before saving.",409);
      if (row.explain.closed && planned > 0) throw new StockError("This is a closed day. Review the event before planning production.");
      if (row.explain.preordersRequireReview) throw new StockError("This closed day has pickup orders. Resolve those orders before accepting the plan.",409);
      const baseline = row.planned;
      if (largeOverride(planned,baseline) && !reason) throw new StockError("Add a reason for a change greater than 20% of the recommendation.");
      const explanation = { ...row.explain, method: "weekday-demand-v1", forecast: true, preorders: row.preorders, suggested: row.suggested, calculatedPlanned: baseline };
      await tx.query(`insert into plan_days(date,product_key,suggested,planned,override_reason,explain,created_by,version) values($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
       on conflict(date,product_key) do update set suggested=excluded.suggested,planned=excluded.planned,override_reason=excluded.override_reason,explain=excluded.explain,created_by=excluded.created_by,version=excluded.version`,[date,row.productKey,row.suggested,planned,reason,JSON.stringify(explanation),actor,expected+1]);
      await tx.query("insert into stock_audit(entity,entity_key,actor,payload) values('forecast-plan',$1,$2,$3::jsonb)", [`${date}/${row.productKey}`,actor,JSON.stringify({before:row.existingPlan,planned,explain:explanation})]);
      return {date,productKey:row.productKey,planned,baseline,reason,version:expected+1};
    });
  }
  async settings() {
    const [settings,events,products] = await Promise.all([this.db.query("select value,version from plan_settings where key='forecast'"),this.db.query("select * from plan_events order by date_from,id"),this.db.query("select product_key,display_name,version,units_per_tray,buffer_k,target_sellout_time from plan_products where active order by family,display_name")]);
    return {persistent:true,version:Number(settings[0]?.version??1),settings:config(settings[0]?.value??defaults),events:events.map(e=>this.event(e)),products:products.map(p=>({key:String(p.product_key),name:String(p.display_name),version:Number(p.version),unitsPerTray:Number(p.units_per_tray),bufferK:Number(p.buffer_k),targetSelloutTime:time(p.target_sellout_time)!}))};
  }
  async update(body: Record<string,unknown>) {
    const actor = staffName(body.actor);
    return this.db.transaction(async tx=>{
      await tx.query("select pg_advisory_xact_lock(7349814)");
      if(body.action==="settings") {
        const value=config(body.settings), expected=version(body.version);
        const rows=await tx.query("update plan_settings set value=$1::jsonb,version=version+1 where key='forecast' and version=$2 returning key",[JSON.stringify(value),expected]);
        if(!rows.length)throw new StockError("Settings changed on another device. Reload first.",409);
      } else if(body.action==="parameters") {
        const tray=quantity(body.unitsPerTray),buffer=decimal(body.bufferK,0,5),target=clock(body.targetSelloutTime),expected=version(body.version);
        if(tray<1||tray>1000)throw new StockError("Use 1–1,000 pieces per tray.");
        const rows=await tx.query("update plan_products set units_per_tray=$1,buffer_k=$2,target_sellout_time=$3,version=version+1 where product_key=$4 and version=$5 returning product_key",[tray,buffer,target,body.productKey,expected]);
        if(!rows.length)throw new StockError("Product changed on another device. Reload first.",409);
      } else if(body.action==="deleteEvent") {
        const rows=await tx.query("delete from plan_events where id=$1 and version=$2 returning id",[String(body.id),version(body.version)]);
        if(!rows.length)throw new StockError("Event changed on another device. Reload first.",409);
      } else if(body.action==="event") {
        if(!body.event||typeof body.event!=="object"||Array.isArray(body.event))throw new StockError("Check the event.");
        const e=body.event as Record<string,unknown>, from=dateKey(e.dateFrom),to=dateKey(e.dateTo),name=staffName(e.name),factor=decimal(e.factor,0,5),scope=String(e.scope),expected=version(e.version??0);
        if(to<from||!["all","family","product"].includes(scope)||typeof e.closed!=="boolean")throw new StockError("Check the event dates and scope.");
        const value=scope==="all"?null:String(e.scopeValue);
        if(scope==="family"&&!FAMILIES.includes(value as typeof FAMILIES[number]))throw new StockError("Choose a valid family.");
        if(scope==="product"&&!(await tx.query("select product_key from plan_products where product_key=$1",[value])).length)throw new StockError("Choose a product.");
        const id=typeof e.id==="string"&&e.id?e.id:randomUUID();
        if(expected===0){if((await tx.query("select id from plan_events where id=$1",[id])).length)throw new StockError("Event changed. Reload first.",409);await tx.query("insert into plan_events(id,date_from,date_to,name,factor,scope,scope_value,closed) values($1,$2,$3,$4,$5,$6,$7,$8)",[id,from,to,name,factor,scope,value,e.closed]);}
        else {const rows=await tx.query("update plan_events set date_from=$2,date_to=$3,name=$4,factor=$5,scope=$6,scope_value=$7,closed=$8,version=version+1 where id=$1 and version=$9 returning id",[id,from,to,name,factor,scope,value,e.closed,expected]);if(!rows.length)throw new StockError("Event changed. Reload first.",409);}
      } else throw new StockError("Choose a valid settings action.");
      const safe={action:body.action,settings:body.action==="settings"?config(body.settings):undefined,productKey:body.action==="parameters"?body.productKey:undefined,eventId:body.action==="deleteEvent"?body.id:undefined};
      await tx.query("insert into stock_audit(entity,entity_key,actor,payload) values('planning-settings',$1,$2,$3::jsonb)",[String(body.action),actor,JSON.stringify(safe)]);
      return {ok:true};
    });
  }
}
