import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const origin = "http://127.0.0.1:3213";
const password = "native-form-test-password";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3213"], {
  env: { ...process.env, VERCEL: "", DATABASE_URL: "", DASHBOARD_FEED_SECRET: "", DASHBOARD_PASSWORD: password, DASHBOARD_SESSION_SECRET: "native-form-session-secret-at-least-32-characters" },
  stdio: "ignore", windowsHide: true,
});
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) break;
    try { if ((await fetch(origin + "/login")).ok) { ready = true; break; } } catch {}
    await new Promise(done => setTimeout(done, 500));
  }
  assert.equal(ready, true, "isolated login server must be ready");
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true });
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem("edelweiss-stock-practice-v2", "done"));
  const page = await context.newPage();
  await page.goto(origin + "/login");
  await page.getByLabel("Dashboard password", { exact: true }).fill(password);
  const [response] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === "/api/auth/login" && response.request().method() === "POST"),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
  const submittedOrigin = (await response.request().allHeaders()).origin;
  assert.equal(response.status(), 303, `native sign-in must accept its own form; browser Origin was ${submittedOrigin}`);
  assert.equal(submittedOrigin, origin, "the actual browser must send its origin without a test override");
  assert.ok((await context.cookies()).some(cookie => cookie.name === "edelweiss_dashboard" && cookie.httpOnly && cookie.secure));
  await page.goto(origin + "/stock");
  await page.getByRole("heading", { name: "Stock & Production", exact: true }).waitFor();
  const post = source => context.request.post(origin + "/api/auth/login", { headers: { Origin: source }, form: { password }, maxRedirects: 0 });
  for (const source of ["null", "https://untrusted.invalid"]) assert.equal((await post(source)).status(), 403, "untrusted origins must remain rejected");
  console.log("PASS: real browser sign-in form, native Origin header, secure session and cross-origin/null rejection");
} finally { await browser?.close(); server.kill(); }
