import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";
const origin = "http://127.0.0.1:3214";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3214"], {
  env: { ...process.env, VERCEL: "", DATABASE_URL: "", DASHBOARD_FEED_SECRET: "", DASHBOARD_PASSWORD: "help-browser-password", DASHBOARD_SESSION_SECRET: "help-browser-session-secret-at-least-32-characters" }, stdio: "ignore", windowsHide: true,
});
let browser;
async function exercise(page, lang, width) {
  const lab = page.getByRole("dialog"), workspace = lab.getByTestId("practice-workspace");
  const screenshot = async name => {
    const coach = await lab.getByTestId("practice-coach").boundingBox(), screen = await workspace.boundingBox();
    assert.ok(coach.y + coach.height <= screen.y + 1 || coach.x >= screen.x + screen.width - 1, "instructions must not cover the practice section");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `output/stock-help/practice-${lang}-${width}-${name}.png` });
  };
  await lab.getByRole("button", { name: "Next bake", exact: true }).click();
  await workspace.getByText("Why this quantity?", { exact: true }).click();
  await workspace.getByLabel("Planned quantity", { exact: true }).fill("22");
  await lab.getByText(lang === "en" ? "Step 3 of 18" : "Paso 3 de 18", { exact: true }).waitFor();
  assert.equal(await workspace.getByLabel("Reason", { exact: true }).inputValue(), "");
  await workspace.getByLabel("Planned quantity", { exact: true }).fill("26");
  await lab.getByTestId("practice-coach").getByRole("button", { name: lang === "en" ? "Back" : "Volver", exact: true }).click();
  assert.equal(await workspace.getByLabel("Planned quantity", { exact: true }).inputValue(), "20", "Back must repeat the input action without stale completed values");
  await workspace.getByLabel("Planned quantity", { exact: true }).fill("26");
  await workspace.getByLabel("Reason", { exact: true }).fill("L");
  await lab.getByText(lang === "en" ? "Step 4 of 18" : "Paso 4 de 18", { exact: true }).waitFor();
  await workspace.getByLabel("Reason", { exact: true }).fill("Local event");
  await screenshot("plan");
  if (lang === "en") {
    await lab.getByLabel("Practice language", { exact: true }).selectOption("es");
    assert.equal(await workspace.getByLabel("Planned quantity", { exact: true }).inputValue(), "26");
    await page.screenshot({ path: "output/stock-help/practice-es-desktop-plan.png" });
    await lab.getByLabel("Idioma de la práctica", { exact: true }).selectOption("en");
  }
  await workspace.getByRole("button", { name: "Save plan", exact: true }).click();
  await lab.getByRole("button", { name: "Today & close", exact: true }).click();
  await workspace.getByLabel("Actually baked", { exact: true }).fill("26");
  await workspace.getByLabel("Left over", { exact: true }).fill("4");
  await workspace.getByText("Where did leftovers go?", { exact: true }).click();
  await workspace.getByLabel("Too Good To Go", { exact: true }).fill("2");
  await workspace.getByLabel("Reused", { exact: true }).fill("1");
  await workspace.getByLabel("Discarded", { exact: true }).fill("1");
  await screenshot("close");
  await workspace.getByRole("button", { name: "Finish product", exact: true }).click();
  await workspace.getByText("Reviewed", { exact: true }).waitFor();
  assert.equal(await workspace.getByLabel("Actually baked", { exact: true }).isEditable(), false, "a reviewed training close must not keep editable counts with a stale Reviewed badge");
  await lab.getByRole("button", { name: "Week plan", exact: true }).click();
  await workspace.getByTestId("practice-week-friday").click();
  await workspace.getByLabel("Planned quantity", { exact: true }).fill("18");
  await workspace.getByRole("button", { name: "Save plan", exact: true }).click();
  await lab.getByRole("button", { name: "Review", exact: true }).click();
  await screenshot("result");
  await lab.getByRole("button", { name: lang === "en" ? "Return to real workspace" : "Volver al espacio real", exact: true }).click();
}
try {
  let ready = false;
  for (let i = 0; i < 60; i++) { try { if ((await fetch(origin + "/login")).ok) { ready = true; break; } } catch {} await new Promise(done => setTimeout(done, 500)); }
  assert.ok(ready);
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => { localStorage.setItem("edelweiss-stock-tour-v1", "done"); sessionStorage.setItem("practice-isolation-check", "keep-real-draft"); });
  const login = await context.request.post(origin + "/api/auth/login", { headers: { Origin: origin }, form: { password: "help-browser-password" }, maxRedirects: 0 }); assert.equal(login.status(), 303);
  const page = await context.newPage(); let mutations = 0, businessRequests = 0; const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method())) mutations++; });
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/stock") && !request.url().includes("/guides/")) businessRequests++; });
  await mkdir("output/stock-help", { recursive: true });
  await page.goto(origin + "/stock");
  await page.getByRole("heading", { name: "Practice with Plain Croissant", exact: true }).waitFor({ timeout: 5000 });
  const date = await page.locator('.stock-date-picker input').inputValue();
  assert.equal(await page.locator(".stock-app").evaluate(element => element.inert), true);
  const initialRequests = businessRequests;
  await exercise(page, "en", 1440);
  assert.equal(businessRequests, initialRequests, "the practice must not call real stock APIs");
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(await page.locator(".stock-app").evaluate(element => element.inert), false);
  assert.equal(await page.locator('.stock-date-picker input').inputValue(), date);
  assert.equal(await page.evaluate(() => sessionStorage.getItem("practice-isolation-check")), "keep-real-draft");
  await page.reload(); await page.locator(".stock-close-card").first().waitFor(); assert.equal(await page.getByRole("dialog").count(), 0);
  await page.setViewportSize({ width: 320, height: 720 });
  await page.getByRole("button", { name: "Help & guides", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Español", exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("link", { name: "English guide · PDF", exact: true }).click()]);
  assert.equal(download.suggestedFilename(), "edelweiss-stock-guide-en.pdf");
  await dialog.getByRole("button", { name: "Iniciar práctica guiada", exact: true }).click();
  await page.getByRole("heading", { name: "Practica con Plain Croissant", exact: true }).waitFor();
  const replayRequests = businessRequests;
  await exercise(page, "es", 320);
  assert.equal(businessRequests, replayRequests, "replaying practice must not call real stock APIs");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole("button", { name: "Help & guides", exact: true }).click();
  await page.keyboard.press("Tab"); dialog = page.getByRole("dialog"); assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true);
  await page.keyboard.press("Escape"); assert.equal(await dialog.count(), 0);
  const cookie = (await context.cookies()).filter(cookie => cookie.name === "edelweiss_dashboard").map(cookie => `${cookie.name}=${cookie.value}`).join(";");
  for (const lang of ["en", "es"]) {
    const guide = await context.request.get(origin + "/api/stock/guides/" + lang, { headers: { Cookie: cookie } });
    assert.equal(guide.status(), 200); assert.match(guide.headers()["cache-control"], /no-store/);
    const expected = await readFile(`resources/stock-guides/edelweiss-stock-guide-${lang}.pdf`);
    assert.equal(createHash("sha256").update(await guide.body()).digest("hex"), createHash("sha256").update(expected).digest("hex"));
  }
  assert.equal((await fetch(origin + "/api/stock/guides/en")).status, 401);
  assert.equal(mutations, 0, "practice must never save business data"); assert.deepEqual(errors, []);
  console.log("PASS: action-driven practice EN/ES, plan/count/close/week/review, desktop/320px, isolated state and private PDF downloads");
} finally { await browser?.close(); server.kill(); }
