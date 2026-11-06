import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
const origin = "http://127.0.0.1:3214";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3214"], {
  env: { ...process.env, VERCEL: "", DATABASE_URL: "", DASHBOARD_FEED_SECRET: "", DASHBOARD_PASSWORD: "help-browser-password", DASHBOARD_SESSION_SECRET: "help-browser-session-secret-at-least-32-characters" }, stdio: "ignore", windowsHide: true,
});
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) { try { if ((await fetch(origin + "/login")).ok) { ready = true; break; } } catch {} await new Promise(done => setTimeout(done, 500)); }
  assert.ok(ready);
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const login = await context.request.post(origin + "/api/auth/login", { headers: { Origin: origin }, form: { password: "help-browser-password" }, maxRedirects: 0 }); assert.equal(login.status(), 303);
  const page = await context.newPage(); let mutations = 0; const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (request.method() === "POST") mutations++; });
  await page.goto(origin + "/stock");
  const dialog = page.getByRole("dialog");
  await page.getByRole("heading", { name: "Welcome to the bakery workspace", exact: true }).waitFor({ timeout: 5000 });
  await mkdir("output/stock-help", { recursive: true });
  await page.screenshot({ path: "output/stock-help/tour-en-390.png" });
  assert.equal(await page.locator(".stock-app").evaluate(element => element.inert), true);
  const initialDate = await page.locator('input[type="date"]').inputValue();
  for (let i = 0; i < 11; i++) { await dialog.getByRole("button", { name: "Next", exact: true }).click(); assert.ok(await dialog.isVisible()); }
  assert.equal(await dialog.getByRole("link", { name: "English guide · PDF", exact: true }).getAttribute("href"), "/api/stock/guides/en");
  await dialog.getByRole("button", { name: "Finish tour", exact: true }).click();
  assert.equal(await dialog.count(), 0);
  assert.equal(await page.locator(".stock-app").evaluate(element => element.inert), false);
  assert.equal(await page.locator('input[type="date"]').inputValue(), initialDate);
  await page.reload(); await page.locator(".stock-close-card").first().waitFor(); assert.equal(await dialog.count(), 0, "completed tour must not reopen");
  await page.getByRole("button", { name: "Help & guides", exact: true }).click();
  await dialog.getByRole("button", { name: "Español", exact: true }).click();
  await dialog.getByRole("button", { name: "Iniciar visita guiada", exact: true }).click();
  await page.getByRole("heading", { name: "Bienvenidos al espacio de trabajo", exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Siguiente", exact: true }).click();
  await dialog.getByRole("button", { name: "Anterior", exact: true }).click();
  await page.keyboard.press("Escape"); assert.equal(await dialog.count(), 0);
  assert.match(await page.evaluate(() => document.activeElement.textContent), /Help & guides/);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.getByRole("button", { name: "Help & guides", exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.keyboard.press("Tab");
  assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true, "focus must remain in help");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true);
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("link", { name: "English guide · PDF", exact: true }).click()]);
  assert.equal(download.suggestedFilename(), "edelweiss-stock-guide-en.pdf");
  await dialog.getByRole("button", { name: "Iniciar visita guiada", exact: true }).click();
  for (let i = 0; i < 12; i++) {
    const bounds = await dialog.boundingBox(); assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 321 && bounds.y + bounds.height <= 721, "the mobile tour card must stay on screen");
    const next = await dialog.getByRole("button", { name: i === 11 ? "Terminar visita" : "Siguiente", exact: true }).boundingBox();
    assert.ok(next.y >= bounds.y && next.y + next.height <= bounds.y + bounds.height + 1, "mobile navigation must stay visible without scrolling the text");
    if (i === 0 || i === 11) await page.screenshot({ path: `output/stock-help/tour-es-320-step-${i + 1}.png` });
    if (i < 11) await dialog.getByRole("button", { name: "Siguiente", exact: true }).click();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "output/stock-help/tour-es-desktop.png" });
  await page.keyboard.press("Escape");
  // Secure cookies work in Chromium on trusted loopback. The HTTP-only test
  // client's cookie transport needs the already-issued test cookie explicitly.
  const cookie = (await context.cookies()).filter(cookie => cookie.name === "edelweiss_dashboard").map(cookie => `${cookie.name}=${cookie.value}`).join(";");
  const guide = language => context.request.get(origin + "/api/stock/guides/" + language, { headers: { Cookie: cookie } });
  const privateGuide = await guide("en"); assert.equal(privateGuide.status(), 200); assert.match(privateGuide.headers()["content-type"], /application\/pdf/); assert.match((await privateGuide.body()).subarray(0,5).toString(), /%PDF-/);
  for (const language of ["es", "en"]) { const response = await guide(language); assert.equal(response.status(), 200); assert.match(response.headers()["cache-control"], /no-store/); }
  assert.equal((await guide("fr")).status(), 404);
  assert.equal((await fetch(origin + "/api/stock/guides/en")).status, 401);
  assert.equal(mutations, 0, "tour must never save or change business data"); assert.deepEqual(errors, []);
  console.log("PASS: automatic/replay/bilingual tour, unchanged date, no writes, mobile, keyboard focus and private PDF downloads");
} finally { await browser?.close(); server.kill(); }
