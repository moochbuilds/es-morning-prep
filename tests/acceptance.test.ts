/**
 * The eight acceptance scenarios from the dashboard specification, run through
 * the full engine on synthetic data with realistic history.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCatalystView } from "@/lib/engine/catalysts";
import { dayName, sessionInfo } from "@/lib/engine/session";
import { eventDate } from "@/lib/engine/catalysts";
import type { CalendarEvent } from "@/lib/types";

import { SATURDAY, et, run } from "./helpers";

const flatRates = {
  y3m: { level: 4.07, d1: 0, d5: 0 },
  y5: { level: 4.78, d1: 0, d5: 0 },
  y30: { level: 5.35, d1: 0, d5: 0 },
  real10: { level: 2.6, d1: 0, d5: 0 },
};

describe("Scenario 1 — 2Y −20 bp, 10Y −5 bp", () => {
  const a = run({
    rates: { ...flatRates, y2: { level: 4.43, d1: -20, d5: -20 }, y10: { level: 4.91, d1: -5, d5: -5 } },
  });

  it("classifies bull steepening led by the front end", () => {
    assert.equal(a.rates?.session.move, "BULL STEEPENING");
    assert.equal(a.rates?.trend.move, "BULL STEEPENING");
    assert.equal(a.rates?.session.leader, "front");
    assert.equal(a.rates?.session.description, "Front-end yields are leading lower.");
  });

  it("does not simply call falling yields bullish", () => {
    const vital = a.rates!.vital;
    assert.doesNotMatch(`${vital.state} ${vital.interpretation}`, /bullish/i);
    assert.match(vital.interpretation, /benign easing|growth scare/);
  });

  it("reads the same move as a growth scare when credit is deteriorating", () => {
    const stressed = run({
      rates: { ...flatRates, y2: { level: 4.43, d1: -20, d5: -20 }, y10: { level: 4.91, d1: -5, d5: -5 } },
      credit: { hy: { level: 380, d1: 10, d5: 40 }, ig: { level: 105, d1: 3, d5: 10 } },
    });
    assert.equal(stressed.rates?.trend.move, "BULL STEEPENING");
    assert.notEqual(stressed.rates?.vital.signal, "confirming");
    assert.match(stressed.rates!.vital.interpretation, /growth scare/);
  });
});

describe("Scenario 2 — 2Y +4 bp, 10Y +18 bp", () => {
  const a = run({
    rates: { ...flatRates, y2: { level: 4.67, d1: 4, d5: 4 }, y10: { level: 5.14, d1: 18, d5: 18 } },
  });

  it("classifies bear steepening with the long end leading", () => {
    assert.equal(a.rates?.session.move, "BEAR STEEPENING");
    assert.equal(a.rates?.session.leader, "long");
    assert.equal(a.rates?.session.description, "Long-end yields are leading higher.");
  });

  it("shows the evidence behind the label", () => {
    const lines = a.rates!.session.evidence.lines;
    assert.ok(lines.includes("2Y: +4 bp"));
    assert.ok(lines.includes("10Y: +18 bp"));
    assert.ok(lines.includes("2s10s: +14 bp"));
    assert.ok(lines.includes("Long-end yields rose faster than short-end yields."));
  });

  it("colours the interpretation, not the direction of yields", () => {
    assert.notEqual(a.rates?.vital.tone, "constructive");
  });
});

describe("Scenario 3 — VIX +40%, credit stable, term structure normal", () => {
  const a = run({
    futures: { es: -1.3, nq: -1.6, rty: -1.1 },
    vol: { vix: { level: 21, d1: 40, d5: 40 }, futures: [21.5, 22.3] },
  });

  it("keeps the term structure normal", () => {
    assert.equal(a.volatility?.term?.state, "CONTANGO");
    assert.equal(a.volatility?.term?.source, "futures");
    assert.equal(a.volatility?.momentum, "SPIKING");
  });

  it("says the volatility shock is not yet broadly confirmed", () => {
    const d = a.synthesis.divergences.find((x) => x.id === "volatility-only");
    assert.ok(d, "volatility-only divergence expected");
    assert.match(d.detail, /volatility shock is not yet broadly confirmed/);
  });

  it("does not call it confirmed risk-off", () => {
    assert.notEqual(a.synthesis.backdrop.kind, "CONFIRMED_STRESS");
    assert.notEqual(a.synthesis.backdrop.kind, "CONFIRMED_RISK_OFF");
  });
});

describe("Scenario 4 — calm VIX, HY and IG widening rapidly", () => {
  const a = run({
    vol: { vix: { level: 14, d1: 0, d5: 1 } },
    credit: { hy: { level: 330, d1: 12, d5: 45 }, ig: { level: 95, d1: 3, d5: 12 } },
  });

  it("classifies credit as rapidly widening and broadening", () => {
    assert.equal(a.credit?.hy.direction, "RAPIDLY WIDENING");
    assert.equal(a.credit?.quality?.key, "broadening");
  });

  it("flags credit deterioration beneath a calm volatility surface", () => {
    const d = a.synthesis.divergences.find((x) => x.id === "volatility-credit");
    assert.ok(d, "volatility/credit divergence expected");
    assert.equal(d.severity, "high");
    assert.match(d.detail, /Credit deterioration beneath a calm volatility surface/);
    assert.equal(a.synthesis.divergences[0].severity, "high");
  });
});

describe("Scenario 5 — credit, volatility, rates and defensives all stressed", () => {
  const a = run({
    futures: { es: -1.9, nq: -2.4, rty: -2.8 },
    breadth: { vwap: 18, ad: 0.2, rspVsSpy: -0.5 },
    sectors: {
      spy: -1.8,
      moves: {
        semis: -3.5, tech: -2.6, discretionary: -2.8, financials: -2.9, industrials: -2.4,
        energy: -2.0, materials: -2.2, healthcare: -0.3, staples: 0.2, utilities: 0.4,
      },
    },
    rates: {
      ...flatRates,
      y2: { level: 4.28, d1: -12, d5: -35 },
      y10: { level: 4.81, d1: -5, d5: -15 },
    },
    credit: { hy: { level: 420, d1: 18, d5: 60 }, ig: { level: 120, d1: 5, d5: 15 } },
    vol: { vix: { level: 34, d1: 25, d5: 60 }, futures: [31, 29] },
  });

  it("reads each market as stressed", () => {
    assert.equal(a.volatility?.term?.state, "BACKWARDATION");
    assert.equal(a.credit?.vital.signal, "stress");
    assert.equal(a.rates?.vital.signal, "stress");
    assert.equal(a.equities.posture, "RISK-OFF");
  });

  it("displays broadly confirmed risk-off / stress with strong alignment", () => {
    assert.equal(a.synthesis.backdrop.label, "BROADLY CONFIRMED RISK-OFF / STRESS");
    assert.equal(a.synthesis.alignment.state, "STRONG");
    assert.equal(a.synthesis.vitalAlignment.state, "STRESSED");
  });
});

describe("Scenario 6 — ES +1%, NQ +1.3%, RTY +0.2%, RSP lagging, <50% above VWAP", () => {
  const a = run({
    futures: { es: 1.0, nq: 1.3, rty: 0.2 },
    breadth: { vwap: 46, ad: 1.4, rspVsSpy: -0.4 },
  });

  it("does not report strong index confirmation", () => {
    const state = a.equities.participation?.state;
    assert.notEqual(state, "BROAD CONFIRMATION");
    assert.ok(state === "POSITIVE BUT NARROW" || state === "POSITIVE — LARGE-CAP LED", String(state));
  });

  it("surfaces the participation divergence", () => {
    assert.ok(a.synthesis.divergences.some((d) => d.id === "index-participation"));
  });
});

describe("Scenario 7 — cyclicals outperform while credit widens", () => {
  const a = run({
    futures: { es: 0.7, nq: 0.9, rty: 0.7 },
    sectors: {
      spy: 0.7,
      moves: {
        semis: 1.9, tech: 1.3, discretionary: 1.2, financials: 1.1, industrials: 1.0,
        energy: 0.3, materials: 0.6, healthcare: 0.0, staples: -0.2, utilities: -0.4,
      },
    },
    credit: { hy: { level: 320, d1: 5, d5: 20 }, ig: { level: 86, d1: 0, d5: 1 } },
  });

  it("flags the rotation / credit divergence", () => {
    assert.match(a.equities.rotation!.state, /RISK-ON ROTATION/);
    assert.ok(a.synthesis.divergences.some((d) => d.id === "rotation-credit"));
  });
});

describe("Scenario 8 — Saturday, next major event Tuesday", () => {
  const calendar: CalendarEvent[] = [
    { id: "mon-inv", time: new Date(et("2026-09-14", 10 * 60)).toISOString(), title: "Business Inventories", importance: "MED", category: "data" },
    { id: "tue-cpi", time: new Date(et("2026-09-15", 8 * 60 + 30)).toISOString(), title: "CPI", importance: "HIGH", category: "data" },
  ];

  it("names Monday as the next trading session", () => {
    const s = sessionInfo(SATURDAY);
    assert.equal(s.phase, "WEEKEND");
    assert.equal(s.nextSession, "2026-09-14");
    assert.equal(dayName(s.nextSession), "Monday");
  });

  it("puts the next major catalyst on Tuesday, separately", () => {
    const v = buildCatalystView(calendar, null, SATURDAY);
    assert.equal(v.sessionDate, "2026-09-14");
    assert.equal(v.sessionIsToday, false);
    assert.equal(v.releases.filter((e) => e.importance === "HIGH").length, 0);
    assert.ok(v.nextMajor);
    assert.equal(eventDate(v.nextMajor.release), "2026-09-15");
    assert.match(v.eventRisk.rationale, /on Monday/);
  });

  it("still names Monday when Monday has no releases at all", () => {
    const v = buildCatalystView(calendar.slice(1), null, SATURDAY);
    assert.equal(v.sessionDate, "2026-09-14");
    assert.equal(v.releases.length, 0);
    assert.equal(eventDate(v.nextMajor!.release), "2026-09-15");
  });
});
