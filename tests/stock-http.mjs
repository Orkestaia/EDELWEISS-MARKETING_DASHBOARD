import assert from "node:assert/strict";
import { spawn } from "node:child_process";
const origin = "http://127.0.0.1:3210";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3210"], { env: { ...process.env, DATABASE_URL: "", DASHBOARD_FEED_SECRET: "", DASHBOARD_PASSWORD: "stock-test-password", DASHBOARD_SESSION_SECRET: "stock-test-session-secret-at-least-32-characters", CRON_SECRET: "stock-test-cron" }, stdio: "ignore" });
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(origin + "/login")).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 500)); }
  assert.equal((await fetch(origin + "/stock", { redirect: "manual" })).status, 307);
  for (const path of ["/api/stock", "/api/stock?week=2026-10-26", "/api/cron/stock-snapshot", "/api/stock/planning", "/api/stock/settings", "/api/stock/suppliers", "/api/stock/analytics"]) assert.equal((await fetch(origin + path)).status, 401);
  for (const path of ["/api/stock", "/api/stock/sync", "/api/stock/planning", "/api/stock/settings", "/api/stock/suppliers"]) assert.equal((await fetch(origin + path, { method: "POST", body: "{}" })).status, 401);
  const login = await fetch(origin + "/api/auth/login", { method: "POST", redirect: "manual", headers: { Origin: origin }, body: new URLSearchParams({ password: "stock-test-password" }) });
  assert.equal(login.status, 303);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const get = path => fetch(origin + path, { headers: { Cookie: cookie } });
  const post = (path, body, source = origin) => fetch(origin + path, { method: "POST", headers: { Cookie: cookie, Origin: source, "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
  const page = await get("/stock"); assert.equal(page.status, 200); assert.match(await page.text(), /Stock &amp;/);
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
  assert.equal(page.headers.get("referrer-policy"), "no-referrer");
  assert.equal(page.headers.get("x-frame-options"), "DENY");
  assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  const response = await get("/api/stock?week=2026-10-29"); assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /no-store/);
  const data = await response.json(); assert.equal(data.week, "2026-10-26"); assert.equal(data.products.length, 26); assert.equal(data.persistent, false); assert.equal(data.feedConfigured, false); assert.equal(data.closes.length, 0);
  assert.equal((await get("/api/stock?week=2026-02-30")).status, 400);
  for (const path of ["/api/stock", "/api/stock/sync", "/api/stock/planning", "/api/stock/settings", "/api/stock/suppliers"]) assert.equal((await post(path, {}, "https://untrusted.invalid")).status, 403);
  assert.equal((await post("/api/stock", { action: "delete" })).status, 400);
  assert.equal((await post("/api/stock", "x".repeat(17000))).status, 413);
  assert.equal((await post("/api/stock", { action: "close" })).status, 503);
  assert.equal((await post("/api/stock/sync", {})).status, 503);
  for(const path of ["/api/stock/planning", "/api/stock/settings", "/api/stock/suppliers", "/api/stock/analytics"]) assert.equal((await get(path)).status,503,path);
  console.log("PASS: stock page/API authentication, CSRF, strict dates, private responses, CSV and honest read-only state");
} finally { child.kill(); }
