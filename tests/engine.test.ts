/**
 * Unit and relationship tests beyond the acceptance scenarios: the curve
 * classifier, the 10Y driver, credit speed, breadth and rotation mechanics,
 * volatility interpretation, the cross-asset relationships the spec names,
 * and the narrative language rules.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeBreadth, analyzeRotation } from "@/lib/engine/equities";
import { languageViolation, sentenceCount } from "@/lib/engine/narrative";
import { classifyCurveMove } from "@/lib/engine/rates";
import { MOCK_SCENARIOS } from "@/lib/scenarios";
import { analyze } from "@/lib/engine";
import { buildScenario } from "@/lib/synthetic";
import type { Breadth } from "@/lib/types";

import { WEEKDAY_RTH, run } from "./helpers";

const stat = (value: number, rank: number | null = 90) => ({ value, rank });

describe("curve classifier", () => {
  const cases: Array<[number, number, string]> = [
    [-20, -5, "BULL STEEPENING"],
    [4, 18, "BEAR STEEPENING"],
    [-4, -18, "BULL FLATTENING"],
    [18, 4, "BEAR FLATTENING"],
  ];
  for (const [d2, d10, expected] of cases) {
    it(`2Y ${d2} / 10Y ${d10} → ${expected}`, () => {
      const m = classifyCurveMove("1D", stat(d2), stat(d10), stat(d10 - d2));
      assert.equal(m.move, expected);
    });
  }

  it("refuses to classify noise", () => {
    const m = classifyCurveMove("1D", stat(1, 20), stat(3, 30), stat(2, 40));
    assert.equal(m.move, "STABLE");
  });

  it("recognises a parallel shift", () => {
    const m = classifyCurveMove("5D", stat(15, 85), stat(16, 85), stat(1, 10));
    assert.equal(m.move, "PARALLEL SHIFT HIGHER");
  });
});

describe("10Y driver", () => {
  const rates = (real: number) => ({
    y3m: { level: 4.07, d1: 0, d5: 0 },
    y2: { level: 4.63, d1: 1, d5: 3 },
    y5: { level: 4.78, d1: 0, d5: 6 },
    y10: { level: 4.96, d1: 4, d5: 14 },
    y30: { level: 5.35, d1: 4, d5: 15 },
    real10: { level: 2.6, d1: 0, d5: real },
  });

  it("attributes a mostly-real move to real yields", () => {
    assert.equal(run({ rates: rates(11) }).rates?.driver?.driver, "REAL YIELDS");
  });

  it("attributes a mostly-breakeven move to inflation expectations", () => {
    assert.equal(run({ rates: rates(2) }).rates?.driver?.driver, "INFLATION EXPECTATIONS");
  });

  it("is omitted when real yields are unavailable", () => {
    assert.equal(run({ rates: { ...rates(0), real10: null } }).rates?.driver, null);
  });
});

describe("yield-curve inversion is background only", () => {
  const a = run({
    rates: {
      y3m: { level: 5.4, d1: 0, d5: 0 },
      y2: { level: 4.9, d1: 0, d5: 0 },
      y5: { level: 4.6, d1: 0, d5: 0 },
      y10: { level: 4.5, d1: 0, d5: 0 },
      y30: { level: 4.6, d1: 0, d5: 0 },
      real10: { level: 2.1, d1: 0, d5: 0 },
    },
  });

  it("reports inversion as cycle context without a bearish signal", () => {
    assert.equal(a.rates?.shape, "INVERTED");
    assert.equal(a.rates?.cycle.inverted, true);
    assert.match(a.rates!.cycle.text, /not an intraday timing signal/);
    assert.equal(a.rates?.vital.signal, "neutral");
  });
});

describe("credit speed", () => {
  it("treats 240 → 290 as rapid deterioration from a healthy level", () => {
    const a = run({ credit: { hy: { level: 290, d1: 8, d5: 50 }, ig: { level: 85, d1: 0, d5: 1 } } });
    assert.equal(a.credit?.hy.band, "TIGHT");
    assert.equal(a.credit?.hy.direction, "RAPIDLY WIDENING");
    assert.equal(a.credit?.quality?.key, "hy-only");
  });

  it("treats a calm 330 as healthy", () => {
    const a = run({ credit: { hy: { level: 330, d1: 0, d5: 1 }, ig: { level: 85, d1: 0, d5: 0 } } });
    assert.equal(a.credit?.hy.direction, "STABLE");
    assert.equal(a.credit?.state, "HEALTHY");
  });
});

describe("breadth is judged against the index's direction", () => {
  const b = (vwap: number, ad: number, rsp: number): Breadth => ({
    pctAboveVwap: vwap,
    advanceDeclineRatio: ad,
    advancers: 340,
    decliners: 163,
    spyChangePct: 0.8,
    rspChangePct: 0.8 + rsp,
    rspVsSpyPct: rsp,
    quoteTime: new Date(WEEKDAY_RTH).toISOString(),
  });

  it("reads the spec's example as MIXED, with the reason spelled out", () => {
    const r = analyzeBreadth(b(47, 2.1, -0.05), 0.8);
    assert.equal(r.state, "MIXED");
    assert.match(r.explanation, /Advance\/decline is positive/);
    assert.match(r.explanation, /less than half of constituents are above VWAP/);
    assert.match(r.explanation, /not confirming strongly/);
  });

  it("reads broad participation as BROAD", () => {
    assert.equal(analyzeBreadth(b(68, 2.4, 0.2), 0.8).state, "BROAD");
  });

  it("reads a broad decline as BROAD SELLING, not BROAD", () => {
    assert.equal(analyzeBreadth(b(20, 0.25, -0.3), -1.5).state, "BROAD SELLING");
  });
});

describe("sector rotation is relative to SPY", () => {
  it("computes the spec's relative-performance example", () => {
    const blocks = buildScenario({
      now: WEEKDAY_RTH,
      sectors: {
        spy: 0.8,
        moves: {
          semis: 1.5, tech: 1.3, financials: 0.9, industrials: 0.8, discretionary: 0.9,
          energy: 0.3, materials: 0.5, healthcare: 0.5, staples: 0.4, utilities: 0.2,
        },
      },
    });
    const rot = analyzeRotation(blocks.sectors.data!)!;
    const rel = (k: string) => rot.leaders.concat(rot.laggards).find((s) => s.key === k)?.relPct;
    assert.equal(rel("tech"), 0.5);
    assert.equal(rel("energy"), -0.5);
  });
});

describe("rotation must be broad to be strong", () => {
  it("caps a spread carried by one or two sectors at MILD and says so", () => {
    const blocks = buildScenario({
      now: WEEKDAY_RTH,
      sectors: {
        spy: 0.5,
        moves: {
          semis: 3.0, tech: 2.4, communication: 0.5, discretionary: 0.4, financials: 0.3, industrials: 0.35,
          materials: 0.2, energy: 0.5, healthcare: -0.3, staples: -0.4, utilities: -0.5, realestate: 0.4,
        },
      },
    });
    const rot = analyzeRotation(blocks.sectors.data!)!;
    assert.equal(rot.state, "MILD RISK-ON ROTATION");
    assert.match(rot.explanation, /concentrated in Technology/);
    assert.ok(rot.evidence.lines.some((l) => l.startsWith("Paired opposites: XLY vs XLP")));
  });

  it("allows STRONG when most cyclicals beat SPY", () => {
    const blocks = buildScenario({
      now: WEEKDAY_RTH,
      sectors: {
        spy: 0.6,
        moves: {
          tech: 1.3, communication: 1.1, discretionary: 1.2, financials: 1.0, industrials: 1.0, materials: 0.9,
          healthcare: -0.2, staples: -0.3, utilities: -0.4,
        },
      },
    });
    assert.equal(analyzeRotation(blocks.sectors.data!)!.state, "STRONG RISK-ON ROTATION");
  });
});

describe("volatility uses level and rate of change", () => {
  it("VIX 14 → 15 slowly: calm with modestly increasing uncertainty", () => {
    const a = run({ vol: { vix: { level: 15, d1: 1.4, d5: 7 } } });
    assert.equal(a.volatility?.state, "CALM");
    assert.match(a.volatility!.vital.interpretation, /modestly increasing uncertainty/);
  });

  it("VIX 14 → 22 rapidly: significant repricing of protection", () => {
    const a = run({ vol: { vix: { level: 22, d1: 57, d5: 57 } } });
    assert.equal(a.volatility?.momentum, "SPIKING");
    assert.match(a.volatility!.vital.interpretation, /Significant repricing of near-term protection/);
  });

  it("never reads low VIX as bullish, and notes complacency", () => {
    const a = run({ vol: { vix: { level: 11, d1: 0, d5: -1 } } });
    assert.ok(a.volatility?.complacency);
    assert.match(a.volatility!.vital.interpretation, /calm now says nothing about calm later/);
    assert.doesNotMatch(a.narrative, /bullish/i);
  });

  it("labels the index-based term structure as a proxy", () => {
    const a = run({ vol: { vix: { level: 16, d1: 0, d5: 0 }, futures: null } });
    assert.equal(a.volatility?.term?.source, "proxy");
    assert.match(a.volatility!.term!.evidence.note!, /PROXY/);
  });
});

describe("cross-asset relationships", () => {
  it("cyclicals leading + credit tightening + VIX declining = strong confirmation", () => {
    const a = run({
      futures: { es: 0.9, nq: 1.1, rty: 1.0 },
      breadth: { vwap: 70, ad: 2.6, rspVsSpy: 0.15 },
      sectors: {
        spy: 0.9,
        moves: {
          semis: 2.1, tech: 1.4, discretionary: 1.3, financials: 1.2, industrials: 1.2,
          energy: 0.6, materials: 0.9, healthcare: 0.2, staples: 0.0, utilities: -0.2,
        },
      },
      credit: { hy: { level: 290, d1: -3, d5: -12 }, ig: { level: 82, d1: -1, d5: -3 } },
      vol: { vix: { level: 14.5, d1: -7, d5: -14 } },
    });
    assert.equal(a.synthesis.backdrop.kind, "CONFIRMED_RISK_ON");
    assert.equal(a.synthesis.alignment.state, "STRONG");
    assert.equal(a.synthesis.divergences.filter((d) => d.severity !== "low").length, 0);
  });

  it("SPX falling + cyclicals improving + credit stable + VIX declining = unconfirmed selloff", () => {
    const a = run({
      futures: { es: -1.0, nq: -1.1, rty: -0.8 },
      breadth: { vwap: 38, ad: 0.7, rspVsSpy: 0.1 },
      sectors: {
        spy: -1.0,
        moves: {
          semis: -0.3, tech: -0.6, discretionary: -0.5, financials: -0.4, industrials: -0.5,
          energy: -1.0, materials: -0.9, healthcare: -1.4, staples: -1.3, utilities: -1.5,
        },
      },
      vol: { vix: { level: 16, d1: -4, d5: -10 } },
    });
    assert.ok(a.synthesis.divergences.some((d) => d.id === "unconfirmed-selloff"));
    assert.equal(a.synthesis.backdrop.kind, "RISK_OFF_UNCONFIRMED");
  });

  it("SPX rising + defensives outperforming + RTY/RSP lagging = fragile strength", () => {
    const a = run({
      futures: { es: 0.7, nq: 0.8, rty: 0.1 },
      breadth: { vwap: 48, ad: 1.2, rspVsSpy: -0.35 },
      sectors: {
        spy: 0.7,
        moves: {
          semis: 0.2, tech: 0.5, discretionary: 0.3, financials: 0.3, industrials: 0.4,
          energy: 0.5, materials: 0.4, healthcare: 1.3, staples: 1.2, utilities: 1.5,
        },
      },
    });
    const d = a.synthesis.divergences.find((x) => x.id === "index-participation");
    assert.ok(d);
    assert.equal(d.severity, "high");
    assert.match(d.detail, /fragile/);
  });

  it("the reference example reads risk-on with uneven participation", () => {
    const a = analyze(buildScenario(MOCK_SCENARIOS.reference(WEEKDAY_RTH)));
    assert.equal(a.synthesis.backdrop.label, "RISK-ON — UNEVEN PARTICIPATION");
    assert.equal(a.synthesis.alignment.state, "MIXED");
    assert.equal(a.synthesis.tailwind, "Credit remains healthy and volatility is declining");
    assert.equal(a.synthesis.headwind, "Long-term rates are rising, led by real yields");
    assert.equal(a.synthesis.divergence, "Small caps are lagging");
    assert.equal(a.rates?.trend.move, "BEAR STEEPENING");
    assert.equal(a.rates?.driver?.driver, "REAL YIELDS");
    assert.equal(a.equities.posture, "CONSTRUCTIVE");
    assert.equal(a.synthesis.whatChanged.length, 3);
  });

  it("a stress-level rates move outranks a participation caveat in the headline", () => {
    const ref = MOCK_SCENARIOS.reference(WEEKDAY_RTH);
    const a = analyze(
      buildScenario({
        ...ref,
        rates: {
          ...ref.rates!,
          y2: { level: 4.63, d1: 7, d5: 29 },
          y10: { level: 4.96, d1: 1, d5: 19 },
          real10: { level: 2.6, d1: 1, d5: 18 },
        },
      }),
    );
    assert.equal(a.rates?.trend.move, "BEAR FLATTENING");
    assert.equal(a.rates?.vital.signal, "stress");
    assert.equal(a.synthesis.backdrop.kind, "RISK_ON_RATES");
    assert.match(a.rates!.vital.interpretation, /driven by real yields/);
    // The participation divergence is still surfaced, just not as the headline.
    assert.ok(a.synthesis.divergences.some((d) => d.id === "index-participation"));
  });

  it("survives missing blocks without inventing a read", () => {
    const blocks = buildScenario({ now: WEEKDAY_RTH, credit: null, vol: null, rates: null, sectors: null, breadth: null, futures: null });
    const a = analyze(blocks);
    assert.equal(a.synthesis.backdrop.kind, "INSUFFICIENT");
    assert.equal(a.synthesis.divergences.length, 0);
  });

  it("keeps event risk out of the market read", () => {
    const quiet = run({ calendar: [] });
    const busy = run({ calendar: MOCK_SCENARIOS.reference(WEEKDAY_RTH).calendar });
    assert.deepEqual(quiet.synthesis, busy.synthesis);
  });
});

describe("narrative language rules", () => {
  it("rejects trade-direction language", () => {
    assert.ok(languageViolation("Look for longs above the overnight high."));
    assert.ok(languageViolation("Traders should buy the dip."));
    assert.ok(languageViolation("A good day to short ES into resistance."));
  });

  it("allows rates vocabulary", () => {
    assert.equal(languageViolation("The short end and long-dated yields moved; short-term rates rose while the long end rallied."), null);
    assert.equal(languageViolation("Broad selling beneath the index."), null);
  });

  for (const name of Object.keys(MOCK_SCENARIOS) as Array<keyof typeof MOCK_SCENARIOS>) {
    it(`rule narrative for "${name}" is clean and at most four sentences`, () => {
      const a = analyze(buildScenario(MOCK_SCENARIOS[name](WEEKDAY_RTH)));
      assert.equal(languageViolation(a.narrative), null, a.narrative);
      assert.ok(sentenceCount(a.narrative) <= 4, a.narrative);
      assert.doesNotMatch(a.narrative, /reinforce|causes|because yields/i);
    });
  }
});
