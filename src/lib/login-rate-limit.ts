import { createHash } from "node:crypto";
import postgres from "postgres";
import { NextResponse } from "next/server";
import { createSession, sameOrigin, secureEqual, SESSION_COOKIE } from "./dashboard-session";

export interface LoginConnection {
  query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
}
type Decision = { allowed: false; retryAfter: number };
type Reservation = { allowed: true; retryAfter: 0; succeed(): Promise<void> };
export interface LoginLimiter { reserve(): Promise<Decision | Reservation> }
interface LimiterOptions {
  database?: LoginConnection;
  vercel?: boolean;
  now?: () => number;
  maxFailures?: number;
  windowMs?: number;
}

// No client-supplied IP header is trusted. This global bucket can temporarily
// block legitimate users after an attack. Each pending comparison reserves a
// slot; a success releases only that slot, never previous failures.
const bucket = createHash("sha256").update("dashboard-login-global-v1").digest("hex");
const maxBodyBytes = 4096;
const timestamp = (value: unknown) => value instanceof Date ? value.getTime() : Date.parse(String(value));
export function createLoginLimiter(options: LimiterOptions = {}): LoginLimiter {
  const now = options.now ?? Date.now;
  const maxFailures = options.maxFailures ?? 30;
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  const database = options.database;
  if (!database && options.vercel) throw new Error("Shared login protection is unavailable");
  let memory = { failures: 0, expiresAt: 0 };
  let ready: Promise<unknown> | undefined;
  const initialize = () => ready ??= database!.query(`do $auth$ begin
    perform pg_advisory_xact_lock(7349813);
    create table if not exists auth_login_limits (
      bucket_key text primary key,
      failures integer not null check (failures >= 0),
      expires_at timestamptz not null
    );
  end $auth$`).catch(error => { ready = undefined; throw error; });
  function reservation(expiresAt: number): Reservation {
    let settled = false;
    return { allowed: true, retryAfter: 0, async succeed() {
      if (settled) return;
      settled = true;
      if (database) {
        await database.query("update auth_login_limits set failures=failures-1 where bucket_key=$1 and expires_at=$2 and failures>0", [bucket, new Date(expiresAt).toISOString()]);
      } else if (memory.expiresAt === expiresAt) {
        memory.failures = Math.max(0, memory.failures - 1);
      }
    } };
  }
  async function reserve(): Promise<Decision | Reservation> {
    const at = now();
    if (!database) {
      if (memory.expiresAt <= at) memory = { failures: 0, expiresAt: at + windowMs };
      if (memory.failures >= maxFailures) return { allowed: false, retryAfter: Math.max(1, Math.ceil((memory.expiresAt - at) / 1000)) };
      memory.failures++;
      return reservation(memory.expiresAt);
    }
    await initialize();
    const rows = await database.query(`insert into auth_login_limits(bucket_key,failures,expires_at) values($1,1,$3)
        on conflict(bucket_key) do update set
          failures=case when auth_login_limits.expires_at <= $2 then 1 else auth_login_limits.failures+1 end,
          expires_at=case when auth_login_limits.expires_at <= $2 then excluded.expires_at else auth_login_limits.expires_at end
        where auth_login_limits.expires_at <= $2 or auth_login_limits.failures < $4
        returning expires_at`, [bucket, new Date(at).toISOString(), new Date(at + windowMs).toISOString(), maxFailures]);
    if (rows.length) return reservation(timestamp(rows[0].expires_at));
    const blocked = await database.query("select expires_at from auth_login_limits where bucket_key=$1", [bucket]);
    const expiresAt = blocked.length ? timestamp(blocked[0].expires_at) : at + 1000;
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((expiresAt - at) / 1000)) };
  }
  return { reserve };
}

let sharedLimiter: LoginLimiter | undefined;
let localLimiter: LoginLimiter | undefined;
async function configuredLimiter() {
  if (process.env.DATABASE_URL) {
    if (!sharedLimiter) {
      const sql = postgres(process.env.DATABASE_URL, { ssl: { rejectUnauthorized: true }, max: 1, connect_timeout: 5, idle_timeout: 20, onnotice: () => {} });
      sharedLimiter = createLoginLimiter({ database: { query: async (statement, params = []) => await sql.unsafe(statement, params as postgres.ParameterOrJSON<never>[]) as unknown as Record<string, unknown>[] } });
    }
    return sharedLimiter;
  }
  if (process.env.VERCEL) throw new Error("Shared login protection is unavailable");
  return localLimiter ??= createLoginLimiter();
}

async function boundedForm(request: Request) {
  const length = request.headers.get("content-length");
  if (length && Number(length) > maxBodyBytes) { await request.body?.cancel(); return null; }
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (reader) {
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > maxBodyBytes) { await reader.cancel(); return null; }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new Request(request.url, { method: "POST", headers: request.headers, body: bytes }).formData();
}

export function createLoginHandler(options: { limiter?: () => Promise<LoginLimiter> } = {}) {
  return async function login(request: Request) {
    const response = (message: string, status: number) => new Response(message, { status, headers: { "Cache-Control": "private, no-store" } });
    const limited = (result: Decision) => new Response("Too many sign-in attempts. Try again later.", { status: 429, headers: { "Retry-After": String(result.retryAfter), "Cache-Control": "private, no-store" } });
    if (!sameOrigin(request)) return response("Forbidden", 403);
    let form: FormData | null;
    try { form = await boundedForm(request); } catch { return response("Invalid request", 400); }
    if (!form) return response("Request is too large", 413);
    try {
      if (!process.env.DASHBOARD_PASSWORD || !process.env.DASHBOARD_SESSION_SECRET || process.env.DASHBOARD_SESSION_SECRET.length < 32) return response("Authentication is unavailable", 503);
      const limiter = await (options.limiter ?? configuredLimiter)();
      // Reserve atomically before checking any guess, including a correct one.
      const state = await limiter.reserve();
      if (!state.allowed) return limited(state);
      const password = form.get("password");
      if (typeof password !== "string" || password.length > 256 || !secureEqual(password, process.env.DASHBOARD_PASSWORD)) {
        const redirect = NextResponse.redirect(new URL("/login?error=1", request.url), 303);
        redirect.headers.set("Cache-Control", "private, no-store");
        return redirect;
      }
      await state.succeed();
      const redirect = NextResponse.redirect(new URL("/", request.url), 303);
      redirect.headers.set("Cache-Control", "private, no-store");
      redirect.cookies.set(SESSION_COOKIE, createSession(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 28800 });
      return redirect;
    } catch { return response("Authentication is unavailable", 503); }
  };
}
