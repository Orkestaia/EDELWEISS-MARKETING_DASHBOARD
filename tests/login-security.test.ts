import { test } from "node:test";
import assert from "node:assert/strict";
import { createSession, validSession } from "../src/lib/dashboard-session";
import { POST } from "../src/app/api/auth/login/route";
import { PGlite } from "@electric-sql/pglite";

const origin = "https://synthetic-dashboard.invalid";
const request = (password: string) => new Request(origin + "/api/auth/login", { method: "POST", headers: { Host: "synthetic-dashboard.invalid", Origin: origin }, body: new URLSearchParams({ password }) });
async function withConfiguration(fn: () => Promise<void>) {
  const names = ["DASHBOARD_PASSWORD", "DASHBOARD_SESSION_SECRET", "DATABASE_URL", "VERCEL"];
  const previous = names.map(name => process.env[name]);
  process.env.DASHBOARD_PASSWORD = "synthetic-password";
  process.env.DASHBOARD_SESSION_SECRET = "synthetic-session-secret-at-least-32-characters";
  delete process.env.DATABASE_URL;
  delete process.env.VERCEL;
  try { await fn(); } finally {
    names.forEach((name, i) => { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; });
  }
}

test("password rotation revokes an existing dashboard session", () => {
  const before = { password: process.env.DASHBOARD_PASSWORD, secret: process.env.DASHBOARD_SESSION_SECRET };
  try {
    process.env.DASHBOARD_PASSWORD = "synthetic-before";
    process.env.DASHBOARD_SESSION_SECRET = "synthetic-session-secret-at-least-32-characters";
    const session = createSession();
    assert.equal(validSession(session), true);
    process.env.DASHBOARD_PASSWORD = "synthetic-after";
    assert.equal(validSession(session), false);
    assert.equal(validSession(createSession()), true);
  } finally {
    if (before.password === undefined) delete process.env.DASHBOARD_PASSWORD; else process.env.DASHBOARD_PASSWORD = before.password;
    if (before.secret === undefined) delete process.env.DASHBOARD_SESSION_SECRET; else process.env.DASHBOARD_SESSION_SECRET = before.secret;
  }
});

test("Vercel refuses login without shared rate-limit storage", async () => withConfiguration(async () => {
  process.env.VERCEL = "1";
  const response = await POST(request("synthetic-password"));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.doesNotMatch(await response.text(), /stack|DATABASE_URL|postgres/i);
}));

test("login rejects oversized bodies before form decoding, including streams without Content-Length", async () => withConfiguration(async () => {
  const response = await POST(request("x".repeat(5000)));
  assert.equal(response.status, 413);
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(5000)); }, cancel() { cancelled = true; } });
  const streamed = new Request(origin + "/api/auth/login", { method: "POST", headers: { Host: "synthetic-dashboard.invalid", Origin: origin, "Content-Type": "application/x-www-form-urlencoded" }, body, duplex: "half" } as RequestInit);
  assert.equal((await POST(streamed)).status, 413);
  assert.equal(cancelled, true);
  const declared = request("synthetic-password");
  declared.headers.set("Content-Length", "5000");
  assert.equal((await POST(declared)).status, 413);
}));

test("local login limits failed attempts globally despite forged IP headers and does not count successes", async () => withConfiguration(async () => {
  for (let i = 0; i < 35; i++) assert.equal((await POST(request("synthetic-password"))).status, 303);
  for (let i = 0; i < 29; i++) {
    const attempt = request("wrong"); attempt.headers.set("x-forwarded-for", `192.0.2.${i}`);
    assert.equal((await POST(attempt)).status, 303);
  }
  assert.equal((await POST(request("synthetic-password"))).status, 303);
  assert.equal((await POST(request("wrong"))).status, 303);
  const response = await POST(request("wrong"));
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get("retry-after")) > 0);
  assert.equal((await POST(request("synthetic-password"))).status, 429);
}));

test("malformed forms return 400 and incomplete authentication configuration returns 503", async () => withConfiguration(async () => {
  const malformed = new Request(origin + "/api/auth/login", { method: "POST", headers: { Host: "synthetic-dashboard.invalid", Origin: origin, "Content-Type": "application/json" }, body: "{}" });
  assert.equal((await POST(malformed)).status, 400);
  process.env.DASHBOARD_SESSION_SECRET = "too-short";
  const unconfigured = await POST(request("synthetic-password"));
  assert.equal(unconfigured.status, 503);
  assert.equal(unconfigured.headers.get("set-cookie"), null);
  assert.doesNotMatch(await unconfigured.text(), /DASHBOARD|too-short|stack/);
}));

test("Postgres reservations share a hard cap and successful release cannot alter another window", async () => {
  const { createLoginLimiter } = await import("../src/lib/login-rate-limit");
  const pg = new PGlite();
  let now = Date.parse("2026-11-05T12:00:00Z");
  const connection = { query: async (sql: string, params: unknown[] = []) => (await pg.query<Record<string, unknown>>(sql, params)).rows };
  const options = { database: connection, vercel: true, now: () => now, maxFailures: 3, windowMs: 60000 };
  const first = createLoginLimiter(options), second = createLoginLimiter(options);
  try {
    const slots = await Promise.all([first.reserve(), second.reserve(), first.reserve()]);
    assert.equal(slots.filter(slot => slot.allowed).length, 3);
    assert.deepEqual(await second.reserve(), { allowed: false, retryAfter: 60 });
    const rows = await pg.query<{ bucket_key: string; failures: number }>("select bucket_key,failures from auth_login_limits");
    assert.equal(rows.rows[0].failures, 3);
    assert.match(rows.rows[0].bucket_key, /^[a-f0-9]{64}$/);
    assert.equal(slots[0].allowed, true);
    if (!slots[0].allowed) throw new Error("Expected an admitted reservation");
    await slots[0].succeed();
    await slots[0].succeed();
    assert.equal((await pg.query<{ failures: number }>("select failures from auth_login_limits")).rows[0].failures, 2);
    const old = await first.reserve();
    assert.equal(old.allowed, true);
    now += 61000;
    const fresh = await second.reserve();
    assert.equal(fresh.allowed, true);
    if (!old.allowed || !fresh.allowed) throw new Error("Expected admitted reservations");
    await old.succeed();
    assert.equal((await pg.query<{ failures: number }>("select failures from auth_login_limits")).rows[0].failures, 1);
    await fresh.succeed();
    assert.equal((await pg.query<{ failures: number }>("select failures from auth_login_limits")).rows[0].failures, 0);
  } finally { await pg.close(); }
});

test("storage failures return a generic 503 without issuing a cookie", async () => withConfiguration(async () => {
  const { createLoginHandler, createLoginLimiter } = await import("../src/lib/login-rate-limit");
  const database = { query: async () => { throw new Error("synthetic-private-database-error"); } };
  const post = createLoginHandler({ limiter: async () => createLoginLimiter({ database, vercel: true }) });
  const response = await post(request("synthetic-password"));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.doesNotMatch(await response.text(), /synthetic-private|stack/i);
}));

test("a stale memory reservation cannot release a slot from the next window", async () => {
  const { createLoginLimiter } = await import("../src/lib/login-rate-limit");
  let now = 100000;
  const limiter = createLoginLimiter({ maxFailures: 2, windowMs: 60000, now: () => now });
  const old = await limiter.reserve();
  now += 61000;
  assert.equal((await limiter.reserve()).allowed, true);
  if (!old.allowed) throw new Error("Expected an admitted reservation");
  await old.succeed();
  assert.equal((await limiter.reserve()).allowed, true);
  assert.deepEqual(await limiter.reserve(), { allowed: false, retryAfter: 60 });
});

test("shared Postgres admits only 30 attempts across concurrent handlers", async () => withConfiguration(async () => {
  const { createLoginHandler, createLoginLimiter } = await import("../src/lib/login-rate-limit");
  const pg = new PGlite();
  const database = { query: async (sql: string, params: unknown[] = []) => (await pg.query<Record<string, unknown>>(sql, params)).rows };
  const first = createLoginLimiter({ database, maxFailures: 30 }), second = createLoginLimiter({ database, maxFailures: 30 });
  const postFirst = createLoginHandler({ limiter: async () => first }), postSecond = createLoginHandler({ limiter: async () => second });
  try {
    const attempts = Array.from({ length: 300 }, (_, i) => (i % 2 ? postFirst : postSecond)(request("wrong")));
    const correct = postSecond(request("synthetic-password"));
    const responses = await Promise.all(attempts);
    const blocked = await correct;
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get("set-cookie"), null);
    assert.equal(responses.filter(response => response.status === 303).length, 30);
    assert.equal(responses.filter(response => response.status === 429).length, 270);
    assert.equal((await pg.query<{ failures: number }>("select failures from auth_login_limits")).rows[0].failures, 30);
  } finally { await pg.close(); }
}));

test("a concurrent burst admits only 30 attempts and a correct password cannot bypass exhausted slots", async () => withConfiguration(async () => {
  const { createLoginHandler, createLoginLimiter } = await import("../src/lib/login-rate-limit");
  const limiter = createLoginLimiter({ maxFailures: 30 });
  const post = createLoginHandler({ limiter: async () => limiter });
  const attempts = Array.from({ length: 300 }, () => post(request("wrong")));
  const correct = post(request("synthetic-password"));
  const responses = await Promise.all(attempts);
  const blocked = await correct;
  assert.equal(blocked.status, 429, "a correct guess in the burst must not bypass exhausted slots");
  assert.equal(blocked.headers.get("set-cookie"), null);
  assert.equal(responses.filter(response => response.status === 303).length, 30);
  assert.equal(responses.filter(response => response.status === 429).length, 270);
}));

test("shared successful logins release reservations when database timestamps include milliseconds", async () => withConfiguration(async () => {
  const { createLoginHandler, createLoginLimiter } = await import("../src/lib/login-rate-limit");
  const pg = new PGlite();
  const database = { query: async (sql: string, params: unknown[] = []) => (await pg.query<Record<string, unknown>>(sql, params)).rows };
  const limiter = createLoginLimiter({ database, now: () => Date.parse("2026-11-05T12:00:00.123Z") });
  const post = createLoginHandler({ limiter: async () => limiter });
  try {
    for (let i = 0; i < 35; i++) {
      const response = await post(request("synthetic-password"));
      assert.equal(response.status, 303, `successful login ${i + 1} should release its exact reservation`);
      assert.ok(response.headers.get("set-cookie"));
    }
    assert.equal((await pg.query<{ failures: number }>("select failures from auth_login_limits")).rows[0].failures, 0);
  } finally { await pg.close(); }
}));
