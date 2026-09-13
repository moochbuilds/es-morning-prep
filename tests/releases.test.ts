/**
 * The economic-release library, surprise judgment, and Current Macro Focus.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RELEASES, RELEASE_FAMILIES } from "@/config/releases";
import { buildCatalystView } from "@/lib/engine/catalysts";
import { macroFocus } from "@/lib/engine/focus";
import { groupReleases, parseFigure, releaseDef } from "@/lib/engine/releases";
import { MOCK_SCENARIOS } from "@/lib/scenarios";
import type { CalendarEvent } from "@/lib/types";

import { WEEKDAY_RTH, et, run } from "./helpers";

const T = new Date(et("2026-09-15", 8 * 60 + 30)).toISOString();
const ev = (key: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: key,
  time: T,
  title: key,
  importance: "MED",
  category: "data",
  key,
  ...extra,
});

describe("release classification", () => {
  const cases: Array<[string, string | null, string | null]> = [
    ["core inflation rate mom", "INFLATION", "Consumer Prices"],
    ["core pce price index mom", "INFLATION", "Consumer Prices"],
    ["ppi mom", "INFLATION", "Producer Prices"],
    ["non farm payrolls", "LABOR", "Employment"],
    ["unemployment rate", "LABOR", "Employment"],
    ["average hourly earnings mom", "LABOR", "Wages"],
    ["initial jobless claims", "LABOR", "Employment"],
    ["jolts job openings", "LABOR", "Employment"],
    ["retail sales mom", "GROWTH", "Consumer Spending"],
    ["ism manufacturing pmi", "GROWTH", "Manufacturing"],
    ["ism services pmi", "GROWTH", "Services"],
    ["ny empire state manufacturing index", "GROWTH", "Manufacturing"],
    ["gdp growth rate qoq adv", "GROWTH", null],
    ["durable goods orders mom", "GROWTH", "Business Investment"],
    ["housing starts", "GROWTH", "Housing"],
    ["michigan consumer sentiment final", "SENTIMENT", "Consumer"],
    ["michigan inflation expectations final", "INFLATION", "Inflation Expectations"],
    ["fed interest rate decision", "FED", "Monetary Policy"],
    ["fed chair powell speech", "FED", "Monetary Policy"],
    ["fed press conference", "FED", "Monetary Policy"],
    ["fomc minutes", "FED", "Monetary Policy"],
  ];
  for (const [key, category, secondary] of cases) {
    it(`${key} → ${category}${secondary ? ` · ${secondary}` : ""}`, () => {
      const d = releaseDef(ev(key));
      assert.equal(d.category, category);
      assert.equal(d.secondary, secondary);
    });
  }

  it("never classifies a release under interest rates", () => {
    for (const d of [...RELEASES, ...RELEASE_FAMILIES]) {
      assert.ok(d.category === null || ["INFLATION", "LABOR", "GROWTH", "FED", "SENTIMENT"].includes(d.category));
      assert.doesNotMatch(d.secondary ?? "", /interest rate/i);
    }
  });

  it("keeps every computed meaning economic, never an equity call", () => {
    const equityCall = /\b(ES|bullish|bearish|stocks?|equit(y|ies)|rally|sell-?off|buy|sell)\b/i;
    for (const d of [...RELEASES, ...RELEASE_FAMILIES]) {
      for (const text of [d.higher, d.lower]) {
        if (text) assert.doesNotMatch(text, equityCall, `${d.id}: ${text}`);
      }
    }
  });

  it("gives the long tail a category, and hides what is not index-relevant", () => {
    for (const key of ["chicago fed national activity index", "dallas fed services index", "balance of trade",
      "wholesale inventories mom", "consumer credit change", "new home sales", "cb leading index mom"]) {
      assert.notEqual(releaseDef(ev(key)).category, null, key);
    }
    const grouped = groupReleases([ev("eia crude oil stocks change"), ev("30-year mortgage rate"), ev("3-month bill auction")]);
    assert.equal(grouped.length, 0);
    const auction = groupReleases([ev("10-year note auction")])[0];
    assert.equal(auction.category, null);
    assert.equal(auction.importance, "HIGH");
  });
});

describe("grouping and figures", () => {
  it("shows CPI as one release with a headline and secondary figure", () => {
    const [cpi, ...rest] = groupReleases([
      ev("core inflation rate mom", { consensus: "0.3%", previous: "0.3%", period: "AUG" }),
      ev("inflation rate yoy", { consensus: "2.9%", previous: "2.9%" }),
      ev("inflation rate mom", { consensus: "0.3%", previous: "0.2%" }),
      ev("core inflation rate yoy", { consensus: "3.1%", previous: "3.1%" }),
    ]);
    assert.equal(rest.length, 0);
    assert.equal(cpi.name, "CPI");
    assert.equal(cpi.importance, "HIGH");
    assert.equal(cpi.period, "AUG");
    assert.deepEqual(cpi.figures.map((f) => f.label), ["Core MoM", "Headline YoY"]);
    assert.equal(cpi.released, false);
    assert.equal(cpi.surprise, null);
    assert.equal(cpi.figures[0].forecast, "0.3%");
    assert.equal(cpi.figures[0].previous, "0.3%");
  });

  it("parses provider figures", () => {
    assert.equal(parseFigure("142K"), 142_000);
    assert.equal(parseFigure("$-78.3B"), -78.3e9);
    assert.equal(parseFigure("0.3%"), 0.3);
    assert.equal(parseFigure("1.95M"), 1_950_000);
    assert.equal(parseFigure(""), null);
    assert.equal(parseFigure("n/a"), null);
  });
});

describe("actual vs forecast", () => {
  const one = (key: string, f: Partial<CalendarEvent>) => groupReleases([ev(key, f)])[0];

  it("CPI above forecast reads as stronger inflation pressure", () => {
    const r = one("core inflation rate mom", { actual: "0.4%", consensus: "0.3%", previous: "0.3%" });
    assert.equal(r.released, true);
    assert.deepEqual(r.surprise, { direction: "above", meaning: "stronger inflation pressure", vsModel: false });
  });

  it("a higher unemployment rate reads as a weakening labor market", () => {
    const r = one("unemployment rate", { actual: "4.3%", consensus: "4.2%" });
    assert.equal(r.surprise?.direction, "above");
    assert.equal(r.surprise?.meaning, "labor market weakening");
  });

  it("a claims miss inside tolerance is in line", () => {
    assert.equal(one("initial jobless claims", { actual: "231K", consensus: "229K" }).surprise?.direction, "inline");
  });

  it("before the print, reads forecast vs previous automatically", () => {
    const retail = one("retail sales mom", { consensus: "0.9%", previous: "-0.6%" });
    assert.equal(retail.released, false);
    assert.deepEqual(retail.expectation, { direction: "above", meaning: "stronger consumer demand", vsModel: false });
    assert.equal(one("core inflation rate mom", { consensus: "0.3%", previous: "0.3%" }).expectation?.direction, "inline");
    assert.equal(one("fed interest rate decision", { consensus: "4%", previous: "3.75%" }).expectation?.meaning, "more restrictive policy");
  });

  it("falls back to the provider's estimate only when there is no consensus, and says so", () => {
    const r = one("non farm payrolls", { actual: "60K", consensus: null, modelForecast: "120K" });
    assert.equal(r.figures[0].forecastSource, "model");
    assert.equal(r.surprise?.direction, "below");
    assert.equal(r.surprise?.vsModel, true);
  });
});

describe("key takeaway", () => {
  const cpiRows = (actual: string | null): CalendarEvent[] => [
    ev("core inflation rate mom", { consensus: "0.3%", previous: "0.3%", actual }),
    ev("inflation rate yoy", { consensus: "2.9%", previous: "2.9%", actual: actual ? "3.0%" : null }),
  ];

  it("leads with a high-impact release that printed away from forecast", () => {
    const after = et("2026-09-15", 9 * 60);
    const v = buildCatalystView(cpiRows("0.4%"), null, after);
    assert.equal(v.headline.text, "CPI above forecast → stronger inflation pressure");
    assert.match(v.headline.detail ?? "", /Actual 0\.4% vs forecast 0\.3%/);
  });

  it("before the print, leads with the session's next high-impact release", () => {
    const before = et("2026-09-15", 7 * 60);
    const v = buildCatalystView(cpiRows(null), null, before);
    assert.equal(v.headline.text, "CPI at 8:30 AM ET");
    assert.equal(v.headline.detail, "Forecast 0.3% · Previous 0.3%");
  });

  it("on a quiet session, points to the next major catalyst", () => {
    const saturday = et("2026-09-12", 10 * 60);
    const v = buildCatalystView(cpiRows(null), null, saturday);
    assert.equal(v.headline.text, "No major U.S. data on Monday");
    assert.match(v.headline.detail ?? "", /Next major: CPI · Tuesday 8:30 AM ET/);
  });
});

describe("current macro focus", () => {
  const upcoming = buildCatalystView(MOCK_SCENARIOS.reference(WEEKDAY_RTH).calendar ?? [], null, WEEKDAY_RTH).later;

  it("a large front-end repricing focuses on the Fed path, with inflation and labor data in focus", () => {
    const a = run({
      rates: {
        y3m: { level: 4.07, d1: 0, d5: 0 },
        y2: { level: 4.63, d1: 7, d5: 29 },
        y5: { level: 4.78, d1: 3, d5: 20 },
        y10: { level: 4.96, d1: 1, d5: 19 },
        y30: { level: 5.35, d1: 1, d5: 12 },
        real10: { level: 2.6, d1: 1, d5: 18 },
      },
    });
    const f = macroFocus(a, upcoming, "2026-09-10");
    assert.equal(f.label, "Fed easing expectations");
    assert.match(f.detail, /pared back/);
    assert.ok(f.categories.includes("INFLATION"));

    const view = buildCatalystView(MOCK_SCENARIOS.reference(WEEKDAY_RTH).calendar ?? [], null, WEEKDAY_RTH, a);
    const cpi = view.later.find((r) => r.name === "CPI");
    assert.equal(cpi?.inFocus, true);
  });

  it("widening credit with falling yields focuses on recession risk", () => {
    const a = run({
      rates: {
        y3m: { level: 3.95, d1: -3, d5: -8 },
        y2: { level: 4.3, d1: -8, d5: -30 },
        y5: { level: 4.5, d1: -6, d5: -22 },
        y10: { level: 4.85, d1: -4, d5: -12 },
        y30: { level: 5.25, d1: -2, d5: -6 },
        real10: { level: 2.4, d1: -3, d5: -8 },
      },
      credit: { hy: { level: 380, d1: 10, d5: 40 }, ig: { level: 105, d1: 3, d5: 10 } },
    });
    assert.equal(macroFocus(a, upcoming, "2026-09-10").label, "Recession risk");
  });

  it("a quiet tape says there is no dominant theme and names the next test", () => {
    const f = macroFocus(run(), upcoming, "2026-09-10");
    assert.equal(f.label, "No dominant theme");
    assert.match(f.detail, /next key test is/);
  });
});
