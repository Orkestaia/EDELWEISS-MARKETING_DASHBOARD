# Stock planning — improvement ideas (Claude, 2026-10-28)

These are proposals to complement `STOCK-PLANNING-SPEC.md`, not requirements. Aitor and Valentina decide which
ones go in and when. Ordered by value / effort.

## 1. Let Clover do the daily close (removes most manual entry)

Staff already set each product's morning stock in Clover, because the website shows "Only X left" and "Sold out" from it.
So the dashboard can derive baked and leftover quantities without asking anyone:

- Snapshot `GET /api/internal/items` at **06:55** (before opening) and at **14:10** (after closing).
- baked ≈ stock at 06:55 + any units sold before the snapshot
- leftover = stock at 14:10
- sold out = stock reached 0, and the time is the last sale

The daily close screen then only asks what Clover can't know: of the leftovers, how many went to Too Good To Go, how many
were reused and how many were discarded. That is about 20 seconds instead of 2 minutes. Keep the full manual form as a
fallback for products whose stock is not tracked.

Contract impact: none. Section 4.3 already returns `stock`; only the two scheduled pulls are new.

## 2. Forecast families first, then split by product mix

Day-to-day noise per single product is high. The total for a family is much steadier, for example all laminated
pieces, and so is each product's share inside it. Forecast the family total with the spec method, then split it by
each product's share over the last 4 same weekdays.

This also captures substitution: when Pain au Chocolat sells out, some customers buy a plain croissant instead.
Compare WMAPE against the per-product forecast and keep whichever is better per family.

## 3. Mid-morning "second tray" call (live pacing)

Use the hourly curve (spec 6.1) live:

- At 9:45, compare each top product's units sold so far with its usual share by 9:45.
- If the pace is more than 130 % of normal and frozen formed pieces exist, show a banner, e.g. "Almond croissant is
  selling 40 % faster than usual: bake one more tray". Optionally also send a push or email.
- If the pace is under 70 %, suggest listing more Too Good To Go bags at 12:30.

This turns the freezer into a same-day buffer, which is what chains get from par-baked product. It needs the 15-minute
pulls from spec 4.5.

## 4. Learn from Valentina's overrides

`plan_days` keeps both the suggested and the planned quantity. If the planned quantity is consistently above or below the
suggestion for the same product and weekday, show "You usually add +4 PAC on Saturdays. Make it the default?" and let
her accept it with one click, which adjusts the product's `buffer_k` or the manual par. Her experience becomes a
parameter instead of a daily correction.

## 5. Automatic events and weather (phase 3+)

- **Calendar seed:** US federal holidays, Thanksgiving, Easter, Mother's and Father's Day, Memorial Day–Labor Day
  (beach season in Old Orchard Beach and Saco) and Maine school vacation weeks. Add local Biddeford events once
  Valentina confirms them.
- **Weather:** the free National Weather Service API (no key needed) for 04005. Only flag big deviations, such as snow
  or freezing rain, heat above 85 °F or heavy rain. Learn the factor per flag from the bakery's own history before
  applying it automatically. Until then, show it only as a hint.

## 6. Menu engineering view

With price and unit cost per product, plot popularity (units) against margin, in four quadrants: stars, workhorses,
puzzles and dogs. It helps decide which products to keep, reprice or replace, and it also feeds the buffer: stars get
a higher `buffer_k`.

## 7. Too Good To Go as a measured outlet

Record the number of bags sold each day. A rising trend means systematic overproduction, so the weekly review should
lower the par. A drop to zero bags while waste is still positive is a pricing or listing problem in the app, not a
production problem.

## 8. Seasonal pre-orders as data

Thanksgiving and Christmas pre-orders are exact demand. Store them per product and pickup date so next year's
seasonal plan starts from this year's numbers, including the day-before uplift on the regular counter.
