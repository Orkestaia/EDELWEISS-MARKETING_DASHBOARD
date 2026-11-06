import { createHash, createHmac, randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { chromium, type Browser } from "@playwright/test";
import { maineDate, monday, shiftDate } from "../src/lib/stock/domain";
import type { StockData } from "../src/lib/stock/types";
import type { SupplierData } from "../src/lib/suppliers/types";
import type { AnalyticsView } from "../src/lib/stock/analytics-service";

/** Explicit opt-in: real data stays in memory and private ignored screenshots. */
async function main() {
  if (process.env.STOCK_LIVE_READONLY !== "1") {
    console.log("SKIP: set STOCK_LIVE_READONLY=1 to run the local read-only live-data check.");
    return;
  }
  const { loadEnvConfig } = await import("@next/env");
  loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const origin = "http://127.0.0.1:3212";
  const directory = resolve("output/stock-continuation");
  const failures: string[] = [];
  const check = (value: boolean, label: string) => { if (!value) { failures.push(label); console.log(`CHECK FAIL: ${label}`); } };
  let stage = "configuration", server: ChildProcess | undefined, browser: Browser | undefined;
  try {
    if (!process.env.DATABASE_URL) throw new Error("configuration");
    await new Promise<void>((done, reject) => {
      const probe = createServer();
      probe.once("error", () => reject(new Error("port")));
      probe.listen(3212, "127.0.0.1", () => probe.close(() => done()));
    });
    const sessionSecret = randomBytes(48).toString("hex");
    const testPassword = "stock-local-readonly-test-password";
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3212"], {
      env: { ...process.env, NODE_ENV: "production", DASHBOARD_SESSION_SECRET: sessionSecret, DASHBOARD_PASSWORD: testPassword },
      stdio: "ignore", windowsHide: true,
    });
    let spawnFailed = false; server.once("error", () => { spawnFailed = true; });
    stage = "server readiness";
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (spawnFailed || server.exitCode !== null) break;
      try { if ((await fetch(origin + "/login", { signal: AbortSignal.timeout(1500) })).ok) { ready = true; break; } } catch {}
      await new Promise(done => setTimeout(done, 500));
    }
    if (!ready) throw new Error("server");
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? "C:/Users/aitor/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe" });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await context.addInitScript(() => localStorage.setItem("edelweiss-stock-tour-v1", "done"));
    // The normal login handler reserves a database-backed rate-limit slot.
    // Sign a temporary test session locally to keep this run GET-only.
    const expires = String(Date.now() + 60 * 60 * 1000);
    const passwordHash = createHash("sha256").update(testPassword).digest("hex");
    const signature = createHmac("sha256", sessionSecret).update(`v2.${passwordHash}.${expires}`).digest("base64url");
    await context.addCookies([{ name: "edelweiss_dashboard", value: `${expires}.${signature}`, url: origin, httpOnly: true, sameSite: "Lax", secure: false }]);
    stage = "API checks";
    const tomorrow = shiftDate(maineDate(), 1);
    const get = async <T>(path: string): Promise<T> => {
      const response = await context.request.get(origin + path, { timeout: 60000 });
      if (!response.ok()) { console.log(`GET failed with status ${response.status()}`); throw new Error("api"); }
      return await response.json() as T;
    };
    const stock = await get<StockData>(`/api/stock?week=${monday(tomorrow)}`);
    const forecast = await get<{ rows: unknown[]; preordersStatus: { available: boolean; unmapped: number } }>(`/api/stock/planning?date=${tomorrow}`);
    const settings = await get<{ products: unknown[] }>("/api/stock/settings");
    const purchases = await get<SupplierData>("/api/stock/suppliers");
    const analytics = await get<AnalyticsView>(`/api/stock/analytics?date=${tomorrow}&kind=week`);
    check(analytics.products.length === 26 && analytics.selection.mappedProductCount === 19, "report product coverage incomplete");
    check(stock.catalog.length === 135, "catalogue count differs from expected live baseline");
    check(stock.products.length === 26, "product count differs from expected live baseline");
    check(stock.products.filter(product => product.cloverItemId).length === 19, "mapped product count differs from expected live baseline");
    check(purchases.invoices.length === 3, "invoice count differs from expected live baseline");
    check(forecast.preordersStatus.available && forecast.preordersStatus.unmapped === 0, "preorders need review");
    check(forecast.rows.length === 26 && settings.products.length === 26, "planning product coverage incomplete");
    console.log(JSON.stringify({ catalogCount: stock.catalog.length, productCount: stock.products.length, mappedProductCount: stock.products.filter(product => product.cloverItemId).length, invoiceCount: purchases.invoices.length, preordersAvailable: forecast.preordersStatus.available, preorderReviewCount: forecast.preordersStatus.unmapped }));
    let blockedMutations = 0, externalRequests = 0, pageErrors = 0, consoleErrors = 0;
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) { externalRequests++; await route.abort(); return; }
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) { blockedMutations++; await route.abort(); return; }
      await route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    page.on("pageerror", () => { pageErrors++; });
    page.on("console", message => { if (message.type() === "error") consoleErrors++; });
    await mkdir(directory, { recursive: true });
    stage = "stock page";
    await page.goto(origin + "/stock", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Stock & Production", exact: true }).waitFor();
    check(new URL(page.url()).pathname === "/stock" && Boolean(await page.title()), "page identity missing");
    await page.locator(".stock-close-card").first().waitFor();
    const tabs = [
      { name: "Next bake", slug: "next-bake", heading: "Suggested bake", ready: ".planning-card", selector: ".stock-planning" },
      { name: "Settings", slug: "settings", heading: "Production settings", ready: "legend", selector: ".stock-planning" },
      { name: "Purchases", slug: "purchases", heading: "Purchases and suppliers", ready: "text=Imported invoices (3)", selector: "section[aria-labelledby='supplier-heading']" },
      { name: "Review", slug: "review", heading: "Sales & production reports", ready: ".analytics-metrics", selector: ".stock-analytics" },
    ];
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: width === 320 ? 740 : 844 });
      for (const tab of tabs) {
        stage = `${tab.slug} ${width}px`;
        await page.getByRole("navigation", { name: "Stock workspace" }).getByRole("button", { name: tab.name, exact: true }).click();
        stage = `${tab.slug} ${width}px heading`;
        await page.getByRole("heading", { name: tab.heading, exact: true }).waitFor();
        const panel = page.locator(tab.selector);
        stage = `${tab.slug} ${width}px ready state`;
        await panel.locator(tab.ready).first().waitFor();
        stage = `${tab.slug} ${width}px loading state`;
        await page.waitForFunction(() => [...document.querySelectorAll('[role="status"],output')].every(element =>
          !/^Loading/.test(element.textContent?.trim() ?? "") || element.getClientRects().length === 0));
        check(await page.locator("nextjs-portal").count() === 0, `${tab.slug} ${width}px framework overlay`);
        check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${tab.slug} ${width}px horizontal overflow`);
        stage = `${tab.slug} ${width}px contrast`;
        // Canvas resolves CSS color spaces and alpha; avoid nested named helpers
        // because tsx would serialize Node-only __name calls into the browser.
        const headingContrast = await panel.getByRole("heading", { name: tab.heading, exact: true }).evaluate(element => {
          const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
          context.fillStyle = "#fff"; context.fillRect(0, 0, 1, 1);
          const ancestors: Element[] = [];
          for (let node: Element | null = element; node; node = node.parentElement) ancestors.push(node);
          for (const node of ancestors.reverse()) { context.fillStyle = getComputedStyle(node).backgroundColor; context.fillRect(0, 0, 1, 1); }
          const background = context.getImageData(0, 0, 1, 1).data;
          context.fillStyle = getComputedStyle(element).color; context.fillRect(0, 0, 1, 1);
          const foreground = context.getImageData(0, 0, 1, 1).data;
          const luminances: number[] = [];
          for (const rgb of [foreground, background]) {
            let luminance = 0;
            for (let i = 0; i < 3; i++) { const linear = rgb[i] / 255; luminance += (linear <= .04045 ? linear / 12.92 : ((linear + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i]; }
            luminances.push(luminance);
          }
          return (Math.max(...luminances) + .05) / (Math.min(...luminances) + .05);
        });
        check(headingContrast >= 3, `${tab.slug} ${width}px heading contrast`);
        if (tab.slug === "next-bake") {
          check(await panel.getByRole("button", { name: "Save plan", exact: true }).first().isDisabled(), "next-bake name gate missing");
          await panel.locator("details summary").first().click();
          check(await panel.locator("details").first().getAttribute("open") !== null, "forecast explanation did not open");
        }
        if (tab.slug === "settings") check(await panel.getByRole("button", { name: "Save shop defaults", exact: true }).isDisabled(), "settings name gate missing");
        if (tab.slug === "review") {
          stage = `${tab.slug} ${width}px month selection`;
          await panel.getByRole("combobox", { name: "Compare", exact: true }).selectOption("month");
          await panel.locator("caption").filter({ hasText: "Mean per observed open day" }).waitFor();
          check(await panel.getByRole("img").count() === 1, "review chart missing");
        }
        await panel.getByRole("heading", { name: tab.heading, exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: resolve(directory, `${tab.slug}-${width}.png`), fullPage: false });
        console.log(`CHECK ${tab.slug} ${width}px completed`);
      }
    }
    check(blockedMutations === 0, "unexpected browser mutation was blocked");
    check(externalRequests === 0, "unexpected external browser request was blocked");
    check(pageErrors === 0 && consoleErrors === 0, "browser runtime or console errors");
    console.log(JSON.stringify({ readonly: true, checkedViewports: [390, 320], checkedPanels: 4, pageErrors, consoleErrors, blockedMutations, externalRequests, failures }));
    if (failures.length) process.exitCode = 1;
  } catch (error) {
    // Never print API payloads, URLs with credentials, browser HTML or exceptions.
    console.error(`FAIL: read-only verification stopped at ${stage}. Private diagnostics were suppressed.`);
    const message = error instanceof Error ? error.message : "";
    const category = message.includes("__name is not defined") ? "browser transpilation helper missing" : message.includes("strict mode violation") ? "ambiguous test locator" : message.includes("Timeout") ? "timeout" : "request or assertion";
    console.error(`Diagnostic category: ${category}`);
    console.log(JSON.stringify({ failures }));
    process.exitCode = 1;
  } finally {
    await browser?.close();
    if (server && server.exitCode === null) {
      const exited = new Promise<void>(done => { server!.once("exit", () => done()); });
      server.kill();
      await Promise.race([exited, new Promise<void>(done => setTimeout(done, 5000))]);
    }
  }
}

void main();
