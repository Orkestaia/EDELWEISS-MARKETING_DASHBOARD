import test from "node:test";
import assert from "node:assert/strict";
import { stockParameters } from "../src/lib/stock/postgres-parameters";
test("postgres driver receives JSON values, not JSON encoded as a second string",()=>{
 const values=stockParameters("insert into data(date,payload,actor) values($1,$2::jsonb,$3)",["2026-11-04",JSON.stringify({items:[{units:2}]}),"Valentina"]);
 assert.equal(typeof values[1],"object");
 assert.deepEqual(JSON.parse(JSON.stringify(values[1])),{items:[{units:2}]});
 assert.equal(values[0],"2026-11-04");assert.equal(values[2],"Valentina");
});
