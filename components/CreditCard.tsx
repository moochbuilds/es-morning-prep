"use client";

import type { Block, CreditAnalysis, CreditData, CreditProxy, CreditProxyAnalysis, SessionInfo, Tone } from "@/lib/types";
import { bp, bpLevel, dateKeyLabel, ordinal, pts } from "@/lib/format";
import { quoteLabel } from "@/lib/engine/session";

import { Sparkline } from "./charts/Sparkline";
import { Card } from "./ui/Card";
import { Line } from "./ui/Line";
import { Info, Why } from "./ui/Popover";
import { BlockUnavailable, FreshnessBadge } from "./ui/StatusBadge";
import { DIRECTION_TONE, TONE_TEXT, sentence } from "./ui/tone";

const QUALITY: Record<NonNullable<CreditAnalysis["quality"]>["key"], { label: string; tone: Tone }> = {
  contained: { label: "CONTAINED", tone: "neutral" },
  "hy-only": { label: "LOWER QUALITY ONLY", tone: "caution" },
  broadening: { label: "BROADENING TO IG", tone: "stressed" },
  "ig-only": { label: "IG ONLY", tone: "caution" },
};

function ProxyLine({ proxy, block, session }: { proxy: CreditProxyAnalysis | null; block: Block<CreditProxy>; session: SessionInfo }) {
  return (
    <Line label={<>HYG / LQD <Info term="hygLqd" /></>}>
      {!proxy ? (
        <span className="text-xs text-ink-3">{block.freshness.status === "UNAVAILABLE" ? "Unavailable" : "—"}</span>
      ) : (
        <>
          <Sparkline
            values={proxy.spark}
            format={(v) => v.toFixed(4)}
            label="HYG to LQD price ratio"
            width={100}
            height={22}
            className="w-20 self-center"
          />
          <span className="readout text-xs text-ink-3" title={quoteLabel(proxy.time, session, "cash").label}>
            {pts(proxy.d5)} 5D
          </span>
          <span className={`font-semibold ${TONE_TEXT[proxy.tone]}`}>
            <Why evidence={proxy.evidence} align="right">
              {proxy.state}
            </Why>
          </span>
        </>
      )}
    </Line>
  );
}

export function CreditCard({
  block,
  proxyBlock,
  credit,
  proxy,
  session,
  now,
}: {
  block: Block<CreditData>;
  proxyBlock: Block<CreditProxy>;
  credit: CreditAnalysis | null;
  proxy: CreditProxyAnalysis | null;
  session: SessionInfo;
  now: number;
}) {
  const hy = credit?.hy;
  const lo = credit ? Math.min(...credit.trend.values) : 0;
  const hi = credit ? Math.max(...credit.trend.values) : 0;

  return (
    <Card
      title="Credit"
      badge={
        <FreshnessBadge
          freshness={block.freshness}
          now={now}
          label={hy ? `As of ${dateKeyLabel(hy.asOf)}` : "no data"}
          live={false}
        />
      }
    >
      {!credit || !hy ? (
        <>
          <BlockUnavailable label="Credit spreads" freshness={block.freshness} />
          <div className="mt-3">
            <ProxyLine proxy={proxy} block={proxyBlock} session={session} />
          </div>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="eyebrow flex items-center gap-1.5">
                HY spread (OAS) <Info term="oas" />
              </span>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="readout text-3xl font-semibold text-ink">{hy.level}</span>
                <span className="text-xs text-ink-3">bp · {sentence(hy.band)}</span>
              </p>
            </div>
            <div className="shrink-0 text-right">
              <span className="eyebrow">State</span>
              <p className={`mt-1 text-2xl font-semibold leading-tight tracking-tight ${TONE_TEXT[credit.vital.tone]}`}>
                <Why evidence={{ ...credit.vital.evidence, lines: [credit.vital.interpretation, ...credit.vital.evidence.lines] }} align="right">
                  {credit.state}
                </Why>
              </p>
            </div>
          </div>

          <div className="mt-4">
            <Line label="HY change">
              <span className="readout text-ink-2">{bp(hy.d1.value)} 1D</span>
              <span className="readout text-ink">{bp(hy.d5.value)} 5D</span>
            </Line>
            <Line label={<>HY speed <Info term="creditWidening" /></>}>
              {hy.levelPct1y !== null && (
                <span className="readout text-xs text-ink-3">{ordinal(hy.levelPct1y)} pct of 1y</span>
              )}
              <span className={`font-semibold ${TONE_TEXT[DIRECTION_TONE[hy.direction]]}`}>{hy.direction}</span>
            </Line>
            {credit.ig && (
              <Line label="IG spread">
                <span className="readout text-ink-2">
                  {bpLevel(credit.ig.level)} · {bp(credit.ig.d5.value)} 5D
                </span>
                <span className={`font-semibold ${TONE_TEXT[DIRECTION_TONE[credit.ig.direction]]}`}>{credit.ig.direction}</span>
              </Line>
            )}
            {credit.quality && (
              <Line label={<>Stress breadth <Info term="creditQuality" /></>}>
                <span className={`font-semibold ${TONE_TEXT[QUALITY[credit.quality.key].tone]}`}>
                  <Why evidence={{ title: "Where is the stress?", lines: [credit.quality.text] }} align="right">
                    {QUALITY[credit.quality.key].label}
                  </Why>
                </span>
              </Line>
            )}
            <ProxyLine proxy={proxy} block={proxyBlock} session={session} />
          </div>

          <div className="mt-4">
            <span className="text-2xs text-ink-3">
              HY spread · last 3 months · {bpLevel(lo)}–{bpLevel(hi)}
            </span>
            <Sparkline
              values={credit.trend.values}
              dates={credit.trend.dates}
              format={(v) => bpLevel(v)}
              label="HY OAS, last three months"
              height={72}
              className="mt-1 w-full"
            />
          </div>

          <p className="mt-auto pt-3 text-xs leading-relaxed text-ink-2">{credit.vital.interpretation}</p>
        </>
      )}
    </Card>
  );
}
