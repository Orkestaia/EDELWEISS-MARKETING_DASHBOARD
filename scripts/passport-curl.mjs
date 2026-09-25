import { createHmac } from "node:crypto";
const base = process.argv[2];
const secret = process.env.PASSPORT_INGEST_SECRET;
if (!base || !secret) throw new Error("Usage: set PASSPORT_INGEST_SECRET, then node scripts/passport-curl.mjs https://your-test-dashboard [--send]");
const url = new URL("/api/passport/ingest", base);
if (!["http:", "https:"].includes(url.protocol)) throw new Error("Use an HTTP(S) test host");
const rawBody = JSON.stringify({ orderId: "PASSPORT-TEST-001", customerName: "Daniel Test", customerEmail: "daniel@example.com", subtotal: "$45.20", tax: "$2.49", total: "$47.69", pickupDate: "FRIDAY · September 26, 2026" });
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
const quote = value => `'${value.replaceAll("'", `'"'"'`)}'`;
console.log(["curl --fail-with-body -X POST", quote(url.href), "-H 'Content-Type: application/json'", `-H ${quote(`X-Passport-Timestamp: ${timestamp}`)}`, `-H ${quote(`X-Passport-Signature: ${signature}`)}`, `--data-raw ${quote(rawBody)}`].join(" \\\n  "));
if (process.argv.includes("--send")) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Passport-Timestamp": timestamp, "X-Passport-Signature": signature }, body: rawBody });
  const result = await response.json();
  // Do not print bearer tokens or personal passport URLs to terminal logs.
  console.log({ status: response.status, duplicate: result.duplicate, stampsAdded: result.stampsAdded, totalStamps: result.totalStamps, cardCompleted: result.cardCompleted, error: result.error });
  if (!response.ok) process.exitCode = 1;
}
