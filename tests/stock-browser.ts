import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { mkdir, readFile } from "node:fs/promises";
import { chromium, expect, type Browser } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { StockService, type Connection, type Row } from "../src/lib/stock/service";
import { StockError, maineDate } from "../src/lib/stock/domain";
import { loadStockSeed } from "../src/lib/stock/seed";

async function main() {
const origin = "http://127.0.0.1:3211";
const sessionSecret = "stock-browser-session-secret-at-least-32-characters";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3211"], { env: { ...process.env, DATABASE_URL: "", DASHBOARD_FEED_SECRET: "", DASHBOARD_PASSWORD: "stock-browser-password", DASHBOARD_SESSION_SECRET: sessionSecret }, stdio: "ignore" });
const pg = new PGlite();
const wrap = (client: Pick<PGlite, "query">): Connection => ({ query: async <T extends Row>(sql: string, values: unknown[] = []) => (await client.query<T>(sql, values)).rows });
const service = new StockService({ ...wrap(pg), transaction: fn => pg.transaction(tx => fn(wrap(tx))) });
let browser: Browser | undefined;
try {
  await service.migrate(loadStockSeed());
  for (let i = 0; i < 60; i++) { try { if ((await fetch(origin + "/login")).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 500)); }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => localStorage.setItem("edelweiss-stock-tour-v1", "done"));
  const login = await context.request.post(origin + "/api/auth/login", { headers: { Origin: origin }, form: { password: "stock-browser-password" }, maxRedirects: 0 });
  assert.equal(login.status(), 303);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/stock?*", async route => {
    const week = new URL(route.request().url()).searchParams.get("week")!;
    await route.fulfill({ json: await service.view(week, false) });
  });
  let rejectNext = false;
  await page.route("**/api/stock", async route => {
    if (route.request().method() !== "POST") return route.continue();
    if (rejectNext) { rejectNext = false; return route.fulfill({ status: 503, json: { error: "Test connection interrupted. Please retry." } }); }
    const body = route.request().postDataJSON();
    try {
      const result = body.action === "close" ? await service.saveClose(body) : body.action === "plan" ? await service.savePlan(body) : await service.saveProduct(body);
      await route.fulfill({ json: result });
    } catch (error) { await route.fulfill({ status: error instanceof StockError ? error.status : 500, json: { error: (error as Error).message } }); }
  });
  await page.goto(origin + "/stock");
  await expect(page.locator(".stock-close-card")).toHaveCount(26);
  await expect(page.getByRole("button", { name: "Finish product", exact: true }).first()).toBeDisabled();
  await page.getByPlaceholder("Enter before editing").fill("Valentina");
  await page.getByRole("textbox", { name: "Find a product" }).fill("Plain Croissant");
  const card = page.locator(".stock-close-card"); await expect(card).toHaveCount(1);
  await expect(card.getByRole("spinbutton", { name: "Actually baked", exact: true })).toHaveValue("");
  await card.getByRole("button", { name: /Confirm baked = plan/ }).click();
  await card.getByRole("spinbutton", { name: "Left over", exact: true }).fill("3");
  await card.getByRole("spinbutton", { name: "Too Good To Go", exact: true }).fill("2");
  await card.getByRole("spinbutton", { name: "Reused", exact: true }).fill("1");
  await card.getByRole("button", { name: "Finish product", exact: true }).click();
  await expect(card.locator(".stock-status")).toHaveText("Reviewed");
  await page.reload();
  await expect(page.locator(".stock-close-card")).toHaveCount(26);
  await page.getByRole("textbox", { name: "Find a product" }).fill("Plain Croissant");
  await expect(card.getByRole("spinbutton", { name: "Left over", exact: true })).toHaveValue("3");
  await expect(card.locator(".stock-status")).toHaveText("Reviewed");
  rejectNext = true;
  await card.getByRole("spinbutton", { name: "Actually baked", exact: true }).fill("18");
  await expect(card.getByRole("alert")).toContainText("Test connection interrupted");
  await expect(card.getByRole("spinbutton", { name: "Actually baked", exact: true })).toHaveValue("18");
  await card.getByRole("button", { name: "Save progress", exact: true }).click();
  await expect(card.locator(".stock-status")).toHaveText("In progress");
  const current = (await service.view(maineDate(), false)).closes[0];
  await service.saveClose({ ...current, actor: "Another device", productKey: current.productKey, baked: 19, status: "draft" });
  await card.getByRole("spinbutton", { name: "Actually baked", exact: true }).fill("20");
  await expect(card.getByRole("alert")).toContainText("Someone changed this count");
  await page.reload();
  await page.getByRole("textbox", { name: "Find a product" }).fill("Plain Croissant");
  await expect(card.getByRole("spinbutton", { name: "Actually baked", exact: true })).toHaveValue("19");
  await mkdir("output/stock-phase-one", { recursive: true });
  await page.screenshot({ path: "output/stock-phase-one/mobile-close.png", fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "mobile should have no horizontal overflow");
  await page.getByRole("button", { name: "Week plan", exact: true }).click();
  await page.locator(".stock-mobile-plan").click();
  await page.getByRole("spinbutton", { name: "Planned quantity" }).fill("99");
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await expect(page.locator(".stock-plan-editor").getByRole("alert")).toContainText("reason");
  await page.getByPlaceholder("e.g. Extra trays for Saturday").fill("Private event");
  await page.getByRole("button", { name: "Save plan", exact: true }).click();
  await expect(page.locator(".stock-mobile-plan strong")).toHaveText("99");
  await page.getByRole("button", { name: "Today & close", exact: true }).click();
  await page.getByRole("textbox", { name: "Find a product" }).fill("Berliner");
  await page.locator(".stock-close-card").getByRole("button", { name: /^Baked \d+ as planned/ }).click();
  await expect(page.locator(".stock-close-card .stock-status")).toHaveText("Reviewed");
  assert.equal((await service.view(maineDate(), false)).closes.find(c => c.productKey === "berliner")?.leftover, 0);
  await page.setViewportSize({ width: 320, height: 720 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "320px phone should have no horizontal overflow");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Week plan", exact: true }).click();
  await page.getByRole("textbox", { name: "Find a product" }).fill("");
  await page.screenshot({ path: "output/stock-phase-one/mobile-week.png", fullPage: true });
  await page.getByRole("button", { name: "Products", exact: true }).click();
  const product = page.locator(".stock-product-editor").filter({ has: page.locator("summary", { hasText: /^Plain Croissant/ }) });
  await product.locator("summary").click();
  await product.getByRole("spinbutton", { name: "Plain Croissant Mon manual par" }).fill("17");
  await product.getByRole("button", { name: "Save defaults" }).click();
  await expect.poll(async () => (await service.view(maineDate(), false)).products.find(p => p.key === "plain")?.pars[0]).toBe(17);
  await page.getByRole("button", { name: "Week plan", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({ path: "output/stock-phase-one/desktop-week.png", fullPage: true });
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: "output/stock-phase-one/week-plan.pdf", preferCSSPageSize: true });
  const pdf = await readFile("output/stock-phase-one/week-plan.pdf");
  assert.equal([...pdf.toString("latin1").matchAll(/\/Type\s*\/Page\b/g)].length, 1, "week must print on one Letter page");
  assert.deepEqual(errors, []);
  console.log("PASS: mobile close/save/reload, quick sold-out close, autosave failure/retry, cross-device conflict, manual plan reasons, product defaults, 320px phone, responsive desktop and one-page Letter PDF");
} finally { await browser?.close(); await pg.close(); server.kill(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
