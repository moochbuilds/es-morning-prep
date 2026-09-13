"use client";

import type { GlossaryKey } from "@/config/glossary";
import type { Block, CurveMove, RatesAnalysis, RatesData } from "@/lib/types";
import { bp, dateKeyLabel, etTime, yieldPct } from "@/lib/format";

import { YieldCurveChart } from "./charts/YieldCurveChart";
import { Card } from "./ui/Card";
import { Line } from "./ui/Line";
import { Info, Why } from "./ui/Popover";
import { BlockUnavailable, FreshnessBadge } from "./ui/StatusBadge";
import { TONE_TEXT } from "./ui/tone";

const MOVE_TERM: Record<CurveMove, GlossaryKey> = {
  "BULL STEEPENING": "bullSteepening",
  "BEAR STEEPENING": "bearSteepening",
  "BULL FLATTENING": "bullFlattening",
  "BEAR FLATTENING": "bearFlattening",
  "PARALLEL SHIFT HIGHER": "parallelShift",
  "PARALLEL SHIFT LOWER": "parallelShift",
  STABLE: "curveStable",
};

export function RatesCard({
  block,
  rates,
  now,
}: {
  block: Block<RatesData>;
  rates: RatesAnalysis | null;
  now: number;
}) {
  return (
    <Card
      title="Rates & Yield Curve"
      badge={
        <FreshnessBadge
          freshness={block.freshness}
          now={now}
          label={rates ? `As of ${dateKeyLabel(rates.asOf)}` : "no data"}
          live={false}
        />
      }
    >
      {!rates ? (
        <BlockUnavailable label="Treasury curve" freshness={block.freshness} />
      ) : (
        <>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="eyebrow flex items-center gap-1.5">
                Curve · 5 days <Info term={MOVE_TERM[rates.trend.move]} />
              </span>
              <p className={`mt-1 text-2xl font-semibold leading-tight tracking-tight ${TONE_TEXT[rates.vital.tone]}`}>
                <Why evidence={{ ...rates.vital.evidence, lines: [rates.vital.interpretation, ...rates.vital.evidence.lines] }}>
                  {rates.trend.move}
                </Why>
              </p>
              <p className="mt-1 text-xs text-ink-2">{rates.trend.description}</p>
            </div>
            <div className="shrink-0 text-right">
              <span className="eyebrow">Last session</span>
              <p className="mt-1 text-sm font-semibold text-ink-2">
                <Why evidence={rates.session.evidence} align="right">
                  {rates.session.move}
                </Why>
              </p>
            </div>
          </div>

          {/* Yields are deliberately uncoloured: whether a move helps or hurts
              depends on which leg moved and why — the state above says that. */}
          <table className="mt-4 w-full">
            <thead>
              <tr className="text-2xs text-ink-3">
                <th className="pb-1 text-left font-normal" />
                <th className="pb-1 text-right font-normal">Level</th>
                <th className="pb-1 text-right font-normal">1D</th>
                <th className="pb-1 text-right font-normal">5D</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {[
                { label: "2Y", level: yieldPct(rates.y2.level), d1: bp(rates.y2.d1.value), d5: bp(rates.y2.d5.value), term: null },
                { label: "10Y", level: yieldPct(rates.y10.level), d1: bp(rates.y10.d1.value), d5: bp(rates.y10.d5.value), term: null },
                { label: "2s10s", level: bp(rates.s2s10.level), d1: bp(rates.s2s10.d1), d5: bp(rates.s2s10.d5), term: "twosTens" as const },
              ].map((r) => (
                <tr key={r.label} className="border-b border-line-soft last:border-b-0">
                  <th scope="row" className="py-2 text-left text-xs font-normal text-ink-3">
                    <span className="flex items-center gap-1.5">
                      {r.label} {r.term && <Info term={r.term} />}
                    </span>
                  </th>
                  <td className="readout py-2 text-right text-ink">{r.level}</td>
                  <td className="readout py-2 text-right text-ink-2">{r.d1}</td>
                  <td className="readout py-2 text-right text-ink">{r.d5}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4">
            <YieldCurveChart
              tenors={rates.curve.tenors}
              today={rates.curve.today}
              weekAgo={rates.curve.weekAgo}
              todayLabel={`Today · ${dateKeyLabel(rates.asOf)}`}
              weekAgoLabel={`1 week ago · ${dateKeyLabel(rates.weekAgoDate)}`}
            />
          </div>

          <div className="mt-3">
            {rates.driver && (
              <Line label={<>10Y driver <Info term="tenYearDriver" /></>}>
                <span className="font-semibold text-ink">
                  <Why evidence={rates.driver.evidence} align="right">
                    {rates.driver.driver === "NONE" ? "NONE" : rates.driver.driver}
                  </Why>
                </span>
              </Line>
            )}
            <Line label={<>3m10y · cycle <Info term="inversion" /></>}>
              <span className="readout text-xs text-ink-3">{bp(rates.s3m10.level)}</span>
              <span className={`font-medium ${rates.cycle.inverted ? "text-warn" : "text-ink-2"}`}>
                <Why evidence={{ title: "Cycle backdrop", lines: [rates.cycle.text] }} align="right">
                  {rates.cycle.inverted ? "INVERTED" : rates.shape}
                </Why>
              </span>
            </Line>
            {rates.live10y && (
              <Line label="Live 10Y · Cboe">
                <span className="readout text-ink">{rates.live10y.yield.toFixed(2)}%</span>
                <span className="readout text-xs text-ink-3" title="Context only; the curve above is the official close">
                  {bp(rates.live10y.changeBp)} · {etTime(rates.live10y.time)}
                </span>
              </Line>
            )}
          </div>

          <p className="mt-auto pt-3 text-xs leading-relaxed text-ink-2">{rates.vital.interpretation}</p>
        </>
      )}
    </Card>
  );
}
