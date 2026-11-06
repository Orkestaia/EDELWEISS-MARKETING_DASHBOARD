import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { StockService, type Connection, type Row } from "../src/lib/stock/service";
import { PlanningService } from "../src/lib/stock/planning-service";
import { loadStockSeed } from "../src/lib/stock/seed";

test("planning persists explanations, protects overrides/settings and keeps private source data out", async () => {
 const pg = new PGlite(); const wrap = (c: Pick<PGlite,"query">):Connection => ({ query:async<T extends Row>(s:string,v:unknown[]=[]) => (await c.query<T>(s,v)).rows });
 const db={...wrap(pg),transaction:<T>(fn:(tx:Connection)=>Promise<T>)=>pg.transaction(tx=>fn(wrap(tx)))};
 try {
  await new StockService(db).migrate(loadStockSeed());
  const service = new PlanningService(db, async()=>({quantities:{plain:2},status:{available:true,message:"Confirmed pickup orders loaded.",unmapped:0}})); await service.migrate();
  const preview=await service.preview("2026-11-06"); const plain=preview.rows.find(r=>r.productKey==="plain")!;
  assert.equal(plain.suggested,16); assert.equal(plain.planned,18); assert.equal(plain.preorders,2);
  await assert.rejects(()=>service.apply({date:"2026-11-06",productKey:"plain",version:0,planned:30,actor:"Valentina",reason:""}),/reason/);
  const saved=await service.apply({date:"2026-11-06",productKey:"plain",version:0,planned:18,actor:"Valentina",reason:""}); assert.equal(saved.baseline,18);
  await assert.rejects(()=>service.apply({date:"2026-11-06",productKey:"plain",version:0,planned:18,actor:"Valentina"}),/changed/);
  const stored=(await pg.query<{explain:{preorders:number}}>("select explain from plan_days where product_key='plain'")).rows[0]; assert.equal(stored.explain.preorders,2);
  const settings=await service.settings();
  await service.update({action:"settings",actor:"Valentina",version:settings.version,settings:{baseWeeks:5,censorCap:1.5,closingTime:"14:00"}});
  await assert.rejects(()=>service.update({action:"settings",actor:"Valentina",version:settings.version,settings:{baseWeeks:5,censorCap:1.5,closingTime:"14:00"}}),/changed/);
  await service.update({action:"event",actor:"Valentina",event:{name:"Closed",dateFrom:"2026-11-06",dateTo:"2026-11-06",factor:0,scope:"all",scopeValue:null,closed:true,version:0}});
  assert.equal((await service.preview("2026-11-06")).rows.find(r=>r.productKey==="plain")!.suggested,0);
  const unavailable = new PlanningService(db,async()=>({quantities:{},status:{available:false,message:"Order source unavailable",unmapped:0}}));
  await assert.rejects(()=>unavailable.apply({date:"2026-11-06",productKey:"pac",version:0,planned:16,actor:"Valentina"}),/orders/);
  const changing = new PlanningService(db,async()=>{await db.query("update plan_products set version=version+1 where product_key='pac'");return {quantities:{pac:1},status:{available:true,message:"Confirmed orders",unmapped:0}};});
  await assert.rejects(()=>changing.apply({date:"2026-11-07",productKey:"pac",version:0,planned:21,actor:"Valentina"}),/changed/);
 } finally { await pg.close(); }
});
