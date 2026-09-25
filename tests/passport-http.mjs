import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
const origin = "http://127.0.0.1:3200";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3200"], { env: { ...process.env, DATABASE_URL: "", DASHBOARD_PASSWORD: "test-only-password", DASHBOARD_SESSION_SECRET: "test-only-session-secret-at-least-32-characters", PASSPORT_INGEST_SECRET: "test-only-ingest", PASSPORT_READ_SECRET: "test-only-read", PASSPORT_REDEEM_SECRET: "test-only-redeem", CRON_SECRET: "test-only-cron" }, stdio: "ignore" });
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${origin}/login`)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  assert.equal((await fetch(origin, { redirect: "manual" })).status, 307);
  for (const path of ["/api/content", "/api/admin/passport", "/api/passport/card/invalid", "/api/cron/daily-sync"]) assert.equal((await fetch(origin + path)).status, 401, path);
  for (const path of ["/api/sync", "/api/passport/ingest", "/api/passport/rewards/validate", "/api/passport/rewards/redeem"]) assert.equal((await fetch(origin + path, { method: "POST", body: "{}" })).status, 401, path);
  assert.equal((await fetch(`${origin}/api/passport/card/invalid`, { headers: { Authorization: "Bearer test-only-read" } })).status, 404);
  const body = JSON.stringify({ orderId: "http-no-email" });
  const send = (timestamp, signature) => fetch(`${origin}/api/passport/ingest`, { method: "POST", headers: { "Content-Type": "application/json", "X-Passport-Timestamp": timestamp, "X-Passport-Signature": signature }, body });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = ts => createHmac("sha256", "test-only-ingest").update(`${ts}.${body}`).digest("hex");
  assert.deepEqual(await (await send(timestamp, signature(timestamp))).json(), { skipped: true, reason: "no_email" });
  assert.equal((await send(timestamp, "0".repeat(64))).status, 401);
  const old = String(Number(timestamp) - 301); assert.equal((await send(old, signature(old))).status, 401);
  const login = password => fetch(`${origin}/api/auth/login`, { method: "POST", redirect: "manual", headers: { Origin: origin }, body: new URLSearchParams({ password }) });
  const wrong = await login("wrong"); assert.equal(wrong.status, 303, await wrong.text()); assert.match(wrong.headers.get("location"), /error=1/);
  const response = await login("test-only-password");
  assert.equal(response.status, 303);
  const cookie = response.headers.get("set-cookie"); assert.match(cookie, /HttpOnly/i); assert.match(cookie, /Secure/i); assert.match(cookie, /SameSite=lax/i);
  // A valid session reaches the internal handler (database unavailable => 503, not 401).
  assert.equal((await fetch(`${origin}/api/admin/passport`, { headers: { Cookie: cookie.split(";")[0] } })).status, 503);
  console.log("PASS: real HTTP login, session, protected APIs, Passport secrets, HMAC and cron isolation");
} finally { child.kill(); }
