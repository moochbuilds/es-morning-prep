"use client";

import type { Block, SessionInfo, VolatilityAnalysis, VolatilityData } from "@/lib/types";
import { ordinal, pct } from "@/lib/format";
import { quoteLabel } from "@/lib/engine/session";

import { TermStructureChart } from "./charts/TermStructureChart";
import { Card } from "./ui/Card";
import { Line } from "./ui/Line";
import { Info, Why } from "./ui/Popover";
import { BlockUnavailable, FreshnessBadge } from "./ui/StatusBadge";
import { TONE_TEXT, sentence } from "./ui/tone";

export function VolatilityCard({
  block,
  vol,
  session,
  now,
}: {
  block: Block<VolatilityData>;
  vol: VolatilityAnalysis | null;
  session: SessionInfo;
  now: number;
}) {
  const label = block.data ? quoteLabel(block.data.vix.time, session, "cash") : { label: "no data", live: false };
  const term = vol?.term ?? null;
  const backwardation = term?.state === "BACKWARDATION";

  return (
    <Card
      title="Volatility"
      badge={<FreshnessBadge freshness={block.freshness} now={now} label={label.label} live={label.live} />}
    >
      {!vol ? (
        <BlockUnavailable label="Volatility" freshness={block.freshness} />
      ) : (
        <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="eyebrow flex items-center gap-1.5">
                VIX <Info term="vix" />
              </span>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="readout text-3xl font-semibold text-ink">{vol.vix.level.toFixed(2)}</span>
                <span className="text-xs text-ink-3">{sentence(vol.regime)}</span>
              </p>
            </div>
            <div className="shrink-0 text-right">
              <span className="eyebrow">State</span>
              <p className={`mt-1 text-2xl font-semibold leading-tight tracking-tight ${TONE_TEXT[vol.vital.tone]}`}>
                <Why evidence={{ ...vol.vital.evidence, lines: [vol.vital.interpretation, ...vol.vital.evidence.lines] }} align="right">
                  {vol.state}
                </Why>
              </p>
            </div>
          </div>

          <div className="mt-4">
            <Line label="VIX change">
              <span className="readout text-ink-2">{pct(vol.vix.d1Pct.value, 1)} 1D</span>
              <span className="readout text-ink">{pct(vol.vix.d5Pct.value, 1)} 5D</span>
            </Line>
            <Line label="Momentum">
              {vol.vix.levelPct1y !== null && (
                <span className="readout text-xs text-ink-3">{ordinal(vol.vix.levelPct1y)} pct of 1y</span>
              )}
              <span className="font-semibold text-ink">{vol.momentum}</span>
            </Line>
            <Line
              label={
                <>
                  Term structure{" "}
                  <Info term={backwardation ? "backwardation" : term?.source === "proxy" ? "termProxy" : "contango"} />
                </>
              }
            >
              {!term ? (
                <span className="text-xs text-ink-3">Unavailable</span>
              ) : (
                <>
                  <span className="text-xs text-ink-3">{term.source === "futures" ? "VX futures" : "index proxy"}</span>
                  <span
                    className={
                      backwardation
                        ? "rounded border border-neg/40 bg-neg-dim px-1.5 font-semibold text-neg"
                        : `font-semibold ${term.state === "FLAT" ? "text-warn" : "text-ink"}`
                    }
                  >
                    <Why evidence={term.evidence} align="right">
                      {term.state}
                    </Why>
                  </span>
                </>
              )}
            </Line>
          </div>

          {term && (
            <div className="mt-4">
              <TermStructureChart
                points={term.points}
                label={`Volatility term structure: ${term.points.map((p) => `${p.label} ${p.value.toFixed(2)}`).join(", ")}`}
              />
              <p className="readout mt-1 flex flex-wrap justify-center gap-x-4 text-2xs text-ink-3">
                {term.points.map((p) => (
                  <span key={p.label}>
                    {p.label} <span className="text-ink-2">{p.value.toFixed(2)}</span>
                  </span>
                ))}
              </p>
              {term.note && <p className="mt-2 text-xs text-warn">{term.note}</p>}
            </div>
          )}

          <p className="mt-auto pt-3 text-xs leading-relaxed text-ink-2">{vol.vital.interpretation}</p>
        </>
      )}
    </Card>
  );
}
