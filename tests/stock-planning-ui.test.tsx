import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ForecastPlanCard, type ForecastRow } from "../src/components/stock/ForecastPanel";

const row: ForecastRow = {
  productKey: "plain", name: "Plain Croissant", family: "laminated", manualPar: 12, unitsPerTray: 6,
  suggested: 18, planned: 23, preorders: 5,
  existingPlan: { planned: 30, baseline: 23, reason: "Saturday market", version: 2 },
  explain: { base: 12, baseSource: "par", manualPar: 12, sampleDates: [], sampleCount: 0,
    standardDeviation: 0, buffer: 0, seasonFactor: 1, seasonReason: "Waiting for history", eventFactor: 1,
    events: [], corrections: [], warnings: ["Limited history"], summary: "Manual par plus preorders", closed: false, preordersRequireReview: false },
};
const render = (value = row, actor = "Valentina", persistent = true) => renderToStaticMarkup(
  <ForecastPlanCard row={value} date="2026-11-09" actor={actor} persistent={persistent} onSaved={() => {}} onReload={() => {}} />,
);

test("saved manual quantities and reasons remain visible while the current suggestion stays separate", () => {
  const markup = render();
  assert.match(markup, /value="30"/);
  assert.match(markup, /Saturday market/);
  assert.match(markup, /Suggested/);
  assert.match(markup, /18/);
  assert.match(markup, /Limited history/);
  assert.match(markup, /Manual par plus preorders/);
});

test("a reason is required when the saved quantity differs by over 20 percent from suggestion plus preorders", () => {
  const markup = render();
  assert.match(markup, /<input(?=[^>]*name="reason")(?=[^>]*required="")[^>]*>/);
  const nearSuggestion = render({ ...row, existingPlan: { ...row.existingPlan!, planned: 24 } });
  assert.doesNotMatch(nearSuggestion, /<input(?=[^>]*name="reason")(?=[^>]*required="")[^>]*>/);
});

test("forecast edits and saves are disabled without staff name or persistent storage", () => {
  for (const markup of [render(row, ""), render(row, "Valentina", false)]) {
    assert.match(markup, /fieldset disabled=""/);
  }
});
