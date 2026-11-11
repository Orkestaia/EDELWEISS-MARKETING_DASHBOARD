# Stock & Production — review from the website/Clover side (Claude, 2026-11-06)

Reviewed: `src/lib/stock/*` (feed.ts, sync.ts, service.ts, planning-service.ts, planning.ts, preorders.ts,
analytics*.ts), `vercel.json` crons, and the feed contract I serve. I could not log into the live dashboard,
so UI statements below come from Codex's summary, not from use.

Overall: the feed is consumed exactly as specified, validation is strict, and the "empty ≠ zero" discipline is
right. Three findings need action before the recommendations become a daily routine. Numbered answers to the
five questions follow, then a proposed additive contract change (v1.2) that I can build on request.

---

## 1. Double counting between counter, online and future pickups — YES, there is one

**How the feed works today:** `sales-daily` attributes every paid line to the day the order was **paid**
(Clover `createdTime`), not to the pickup day. Online orders on the website can be placed up to 14 days ahead,
and Thanksgiving pre-orders are paid now for pickup on Nov 25.

**What the engine does:** demand per day = `units_in_store + units_online` on the sale date
(`planning-service.ts:57`), and confirmed pre-orders for the pickup date come from the n8n Google Sheet
(`preorders.ts`) and are **added on top** of the suggestion (`planning.ts:135`).

**Result:** an online order paid on Tuesday for pickup on Friday is counted twice: once as Tuesday demand
(online units in the base) and once as Friday pre-orders. It also shifts Tuesday's base up for the next four
weeks of Tuesdays. Same-day online orders (the majority) are fine.

**Thanksgiving specifically:** payments are spread across Oct 27 – Nov 20 and show up in the feed under the
Clover items named "Thanksgiving …". They must **never** be linked to the daily product keys (Plain Croissant,
etc.), or every day until Nov 20 will look busier than it is. Keep them unlinked, or linked to a separate
"Thanksgiving" family that is excluded from the daily base. The Nov 25 production should come only from the
pre-order sheet (plus the counter base for that Wednesday).

**Fix (recommended): contract v1.2, additive, I build it in the website**
- Per item, add `unitsOnlineSameDay` and `unitsOnlineOtherDay` (pickup date ≠ sale date).
- Top level, add `onlinePickups: [{ pickupDate, cloverItemId, name, units }]` for every online line whose
  pickup date is not the sale date. The pickup date is already in the Clover note (`Pick-up: YYYY-MM-DD at HH:MM`).
- Dashboard: base demand = `unitsInStore + unitsOnlineSameDay`; future-dated online units are pre-orders on
  their pickup date. You then have two independent pre-order sources (feed vs Sheet) and can reconcile them;
  the feed one is authoritative for paid website orders, the Sheet keeps phone/in-person orders.

Until v1.2 ships, a safe interim: base demand = `unitsInStore` only, plus `unitsOnline` only when the day has no
future-dated orders (you cannot tell from the current payload, so simply use in-store + online and accept the
small bias; it is mostly same-day pickups).

## 2. Refunds, fractional quantities, deleted items, `stockEnd`

| Topic | Verdict | Detail |
|---|---|---|
| Refunds | Correct, with one gap | The feed drops lines flagged `refunded` and reports them in `refundedUnits`. Refunds done in Clover as an **amount** (not by selecting items) do not flip any line, so those units stay counted. Rare at Edelweiss; accept it. Your filter "days with negative refund adjustments" never triggers: the feed never emits negative units. Harmless. |
| Fractional units | Correct | Only weighed items produce fractions; none of the 26 plan products are weighed. Keep accepting decimals anyway. |
| Deleted/renamed items | Correct | A sold item that no longer exists arrives with `cloverItemId: null` and `stockEnd: null`, matched by name. A **renamed** item keeps its id, so history stays attached. Good. |
| `stockEnd` | Correct not to treat it as historical sell-out | It is the count at call time. However the `stock-snapshot` crons run at 06:30 and 07:30 UTC (01:30/02:30 ET): at that hour the catalogue `stock` of a tracked item **is** the closing leftover, because nobody restocks overnight. Use it as an *estimated* leftover (clearly labelled) when staff did not close, and as corroboration when they did. Caveat: if staff zero the counts at closing time, the estimate is wrong; check this habit with Valentina before relying on it. |
| `hourly` | One caveat | It includes online units at **payment** time. For the sell-out curve that is noise (people pay at 9 pm for tomorrow). Use `hourly` for in-store analysis only once v1.2 adds `hourlyInStore`; until then, treat the curve as approximate. |
| Revenue | Caveat for reconciliation | `revenueCents` = unit price × quantity before tax, **ignoring discounts** (Swiss Passport rewards lower the unit price, so those are fine, but POS discounts applied at order level are not subtracted). Reconcile **units**, not revenue, against Clover reports. |

## 3. Sync and the 7-day refresh — they fit, two settings to change

- Nightly sync at 10:15 UTC (05:15 EST / 06:15 EDT): good, yesterday is `complete` by then.
- 7-day refresh: right size. Refunds are usually same-week.
- **Client timeout is 10 s** (`feed.ts`, `AbortSignal.timeout(10000)`). A quiet Monday takes ~4 s on my side;
  a Saturday with 150+ orders can take 8–12 s (two Clover calls plus the catalogue). Raise it to **30 s**.
  My function allows 60 s.
- Budget 200 s per run with sequential days: ~40 days per run worst case, so the initial backfill needed a few
  runs. Fine. Keep it sequential: parallel pulls would trip Clover rate limits.
- `redirect: "error"`: fine, the origin never redirects. Always call `www.` (the apex 308-redirects).
- Hidden items are excluded from the catalogue rows; if Valentina hides an item later, re-pulled past days will
  still carry it when it sold (matched by name) and drop its zero rows otherwise. Your upsert handles both.

## 4. Differences from Valentina's method and from the spec

- Her Excel numbers are **bake quantities including expected leftovers**, not demand. The engine's suggestion is
  demand + buffer, so it should come out **at or below** her par for most products. When you compare one week
  with her, compare against *units sold + leftovers*, not against her par, or she will read every lower number
  as "the machine is wrong".
- Season factor fixed at 1 is right until a year of history exists (planned import).
- Not yet implemented, as you list: sold-out correction, the two weekly safety rules, D-3 dough plan. The
  safety rules are the cheapest big win once closes exist: they are what makes the number react to reality.
- Spec said the pre-order sheet is "added on top, never forecast": correct, but see finding 1 for the
  payment-day leak into the base.
- Good additions beyond the spec: conflict detection on save, the 20 % override reason, and blocking a
  recommendation when pre-orders cannot be read. Keep the block: a silent 0 pre-orders would be worse.

## 5. What to validate first, in order

1. **Mappings.** Finish the 7 pending links, and assert that no `product_key` of the daily plan points to a
   Clover item named "Thanksgiving …" (or any seasonal pre-order item). Add a test for it.
2. **Timeout to 30 s** before the first Saturday hits the sync.
3. **Five-day units reconciliation** against Clover → Reporting → Sales → Items, same Maine dates. Match
   **units**; expect revenue to differ by discounts. Include one day with a known refund and one closed day
   (Oct 28, zero sales, must show as zero not missing).
4. **One real future-dated online order** (I can place one for pickup in 3 days): check it is counted once in
   the dashboard, on the right day. Today it will be counted twice; this makes the v1.2 case concrete.
5. **Staff close under 2 minutes** on the counter iPad, with the `stockEnd` estimate pre-filled as leftover.
6. Only then start the one-week comparison with Valentina.

---

## Proposed contract v1.2 (additive, not built yet; needs Aitor's OK)

`GET /api/internal/sales-daily` gains, per item: `unitsOnlineSameDay`, `unitsOnlineOtherDay`, `hourlyInStore`;
and top level: `onlinePickups: [{ pickupDate, cloverItemId, name, units }]`. Existing fields keep their meaning.
Estimated effort on the website: half a day including a real-order test.

Nothing in this review requires any change on the website today.
