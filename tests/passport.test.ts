import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PassportService, type Connection, type Row } from "../src/lib/passport/service";
import { signedIngest, cents, authenticatedBearer } from "../src/lib/passport/security";
import { createSession, validSession } from "../src/lib/dashboard-session";

const base = "https://passport.edelweisspastryshop.ch";
const order = (id: string, subtotal = "$10.00", email = "daniel@example.com") => ({ orderId: id, customerName: "Daniel Sibley", customerEmail: email, subtotal, total: subtotal });
async function fixture() {
  const pg = new PGlite();
  const wrap = (client: Pick<PGlite, "query">): Connection => ({ query: async <T extends Row>(sql: string, values: unknown[] = []) => (await client.query<T>(sql, values)).rows });
  const service = new PassportService({ ...wrap(pg), transaction: fn => pg.transaction(tx => fn(wrap(tx))) }, base);
  await service.migrate(); await service.migrate();
  return { pg, service };
}
test("raw-body HMAC, stale/future timestamps, malformed signatures and distinct bearer secrets", () => {
  const raw = JSON.stringify(order("signed")); const now = 1800000000000; const ts = String(now / 1000);
  const secret = "test-only-ingest-secret";
  const mac = createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
  const req = (signature: string, timestamp = ts) => new Request("https://test/api/passport/ingest", { headers: { "X-Passport-Timestamp": timestamp, "X-Passport-Signature": signature } });
  assert.equal(signedIngest(req(mac), raw, secret, now), true);
  assert.equal(signedIngest(req(mac), `${raw} `, secret, now), false);
  assert.equal(signedIngest(req("bad"), raw, secret, now), false);
  assert.equal(signedIngest(req(mac), raw, secret, now + 301000), false);
  assert.equal(signedIngest(req(mac), raw, secret, now - 301000), false);
  assert.equal(authenticatedBearer(new Request("https://test", { headers: { Authorization: "Bearer read" } }), "redeem"), false);
  assert.equal(authenticatedBearer(new Request("https://test")), false);
  assert.equal(cents("$45.20"), 4520); assert.equal(cents("$1,200.01"), 120001);
  assert.throws(() => cents("$40.001")); assert.throws(() => cents("-10.00"));
});
test("login cookies reject tampering, expiry, missing configuration", () => {
  process.env.DASHBOARD_PASSWORD = "test-password";
  process.env.DASHBOARD_SESSION_SECRET = "test-only-session-secret-at-least-32-characters";
  const session = createSession();
  assert.equal(validSession(session), true); assert.equal(validSession(session + "x"), false); assert.equal(validSession("1.anything"), false);
  delete process.env.DASHBOARD_PASSWORD; assert.equal(validSession(session), false);
});
test("threshold boundaries, normalized identity, missing email and retry never increment", async () => {
  const { pg, service } = await fixture();
  try {
    assert.equal((await ingest(service, order("normal"))).stampsAdded, 1);
    assert.equal((await ingest(service, order("exact", "$40.00", " DANIEL@EXAMPLE.COM "))).stampsAdded, 1);
    const double = await ingest(service, order("over", "$40.01"));
    assert.equal(double.stampsAdded, 2); assert.equal(double.totalStamps, 4); assert.equal(double.doubleStamp, true);
    const duplicate = await ingest(service, order("over", "$40.01"));
    assert.equal(duplicate.duplicate, true); assert.equal(duplicate.totalStamps, 4); assert.equal(duplicate.stampsAdded, 0);
    assert.deepEqual(await service.ingest({ orderId: "no-email" }), { skipped: true, reason: "no_email" });
    assert.equal((await pg.query("select * from passport_customers")).rows.length, 1);
    const token = double.passportUrl!.split("/").pop()!;
    assert.equal(token.length, 43);
    const card = await service.card(token);
    assert.equal(card?.firstName, "Daniel"); assert.equal(card?.stamps.length, 4);
    assert.equal("email" in card!, false); assert.equal("subtotal" in card!, false);
    assert.equal(await service.card("x".repeat(43)), null);
    assert.equal(await service.card("invalid"), null);
  } finally { await pg.close(); }
});
test("ten orders issue exactly one 30-day reward; finished passport stays 10/10", async () => {
  const { pg, service } = await fixture();
  try {
    let result;
    for (let i = 0; i < 10; i++) result = await ingest(service, order(`normal-${i}`));
    assert.equal(result!.cardCompleted, true); assert.equal(result!.stampsOnCard, 10); assert.equal(result!.carryOver, 0);
    assert.match(result!.reward!.code, /^SWISS-[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(result!.cardImageUrl, `${base}/cards/card-10.jpg`);
    const reward = (await pg.query<{ issued_at: Date; expires_at: Date }>("select * from passport_rewards")).rows[0];
    assert.equal(new Date(reward.expires_at).getTime() - new Date(reward.issued_at).getTime(), 30 * 86400000);
    const extra = await ingest(service, order("after-completion", "$50.00"));
    assert.equal(extra.stampsAdded, 0); assert.equal(extra.totalStamps, 10); assert.equal(extra.cardCompleted, false);
    assert.equal((await pg.query("select * from passport_rewards")).rows.length, 1);
  } finally { await pg.close(); }
});
test("9 + double completes at 10 without carryover (owner-approved amendment)", async () => {
  const { pg, service } = await fixture();
  try {
    for (let i = 0; i < 9; i++) await ingest(service, order(`single-${i}`));
    const result = await ingest(service, order("double", "$40.01"));
    assert.equal(result.stampsOnCard, 10); assert.equal(result.totalStamps, 10); assert.equal(result.stampsAdded, 1); assert.equal(result.carryOver, 0); assert.equal(result.cardCompleted, true);
    assert.deepEqual(result.latestStops?.map(s => s.n), [10]); assert.equal(result.nextStop, null);
  } finally { await pg.close(); }
});
test("void revokes an unredeemed reward; returning to 10 never reissues", async () => {
  const { pg, service } = await fixture();
  try {
    for (let i = 0; i < 10; i++) await ingest(service, order(`order-${i}`));
    const o = (await pg.query<{ id: string }>("select id from passport_orders limit 1")).rows[0];
    await service.voidOrder(o.id, "Refund");
    const c = (await pg.query<{ token: string }>("select token from passport_customers")).rows[0];
    assert.equal((await service.card(c.token))!.stampsOnCard, 9);
    const r = (await pg.query<{ code: string; status: string }>("select code,status from passport_rewards")).rows[0];
    assert.equal(r.status, "revoked"); assert.deepEqual(await service.reward(r.code, "daniel@example.com"), { valid: false, reason: "revoked" });
    const again = await ingest(service, order("replacement"));
    assert.equal(again.cardCompleted, false); assert.equal(again.reward, null); assert.equal(again.stampsOnCard, 10);
    assert.equal((await pg.query("select * from passport_rewards")).rows.length, 1);
  } finally { await pg.close(); }
});
test("validate/redeem, mismatched email, atomic second redemption, same-order retry, expiry", async () => {
  const { pg, service } = await fixture();
  try {
    let completed;
    for (let i = 0; i < 5; i++) completed = await ingest(service, order(`double-${i}`, "$50.00"));
    const code = completed!.reward!.code;
    assert.deepEqual(await service.reward(code, "other@example.com"), { valid: false, reason: "email_mismatch" });
    assert.deepEqual(await service.reward("SWISS-NONE", "daniel@example.com"), { valid: false, reason: "not_found" });
    assert.deepEqual(await service.reward(code, " DANIEL@example.com "), { valid: true, percent: 15 });
    const outcomes = await Promise.all([service.reward(code, "daniel@example.com", "checkout-a"), service.reward(code, "daniel@example.com", "checkout-b")]);
    assert.equal(outcomes.filter(r => r.valid).length, 1); assert.equal(outcomes[1].reason, "redeemed");
    assert.deepEqual(await service.reward(code, "daniel@example.com", "checkout-a"), { valid: true, percent: 15, duplicate: true });
    assert.deepEqual(await service.reward(code, "daniel@example.com"), { valid: false, reason: "redeemed" });
    // A redeemed reward survives voiding and is never reissued.
    const o = (await pg.query<{ id: string }>("select id from passport_orders limit 1")).rows[0];
    await service.voidOrder(o.id, "Refund after redemption"); await ingest(service, order("replacement", "$50.00"));
    assert.equal((await pg.query("select * from passport_rewards")).rows.length, 1);
    for (let i = 0; i < 5; i++) completed = await ingest(service, order(`other-${i}`, "$50.00", "other@example.com"));
    const expiredCode = completed!.reward!.code;
    await pg.query("update passport_rewards set expires_at=now()-interval '1 second' where code=$1", [expiredCode]);
    assert.deepEqual(await service.reward(expiredCode, "other@example.com"), { valid: false, reason: "expired" });
    const card = await service.card(completed!.passportUrl!.split("/").pop()!);
    assert.equal(card!.reward, null); assert.equal(card!.stampsOnCard, 10);
  } finally { await pg.close(); }
});
test("concurrent duplicate deliveries create one order and completion creates one reward", async () => {
  const { pg, service } = await fixture();
  try {
    const duplicates = await Promise.all(Array.from({ length: 8 }, () => ingest(service, order("same"))));
    assert.equal(duplicates.filter(r => !r.duplicate).length, 1);
    await Promise.all(Array.from({ length: 12 }, (_, i) => ingest(service, order(`concurrent-${i}`))));
    assert.equal((await pg.query("select * from passport_orders")).rows.length, 13);
    assert.equal((await pg.query("select * from passport_rewards")).rows.length, 1);
    assert.equal((await service.admin()).customers.length, 1);
  } finally { await pg.close(); }
});

async function ingest(service: PassportService, body: ReturnType<typeof order>) { const result = await service.ingest(body); assert.ok('stampsAdded' in result); return result; }
