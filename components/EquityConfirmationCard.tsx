"use client";

import type { ReactNode } from "react";

import type { GlossaryKey } from "@/config/glossary";
import type { DashboardData, EquityAnalysis, RelativeSector, SessionInfo, Verdict } from "@/lib/types";
import { pct, pts } from "@/lib/format";
import { quoteLabel } from "@/lib/engine/session";

import { Card } from "./ui/Card";
import { Line } from "./ui/Line";
import { Info, Why } from "./ui/Popover";
import { BlockUnavailable, FreshnessBadge, worstFreshness } from "./ui/StatusBadge";
import { TONE_TEXT, moveClass, sentence } from "./ui/tone";

const VERDICT: Record<Verdict, { text: string; cls: string }> = {
  confirms: { text: "confirms", cls: "text-pos" },
  neutral: { text: "neutral", cls: "text-ink-3" },
  contradicts: { text: "against", cls: "text-warn" },
};

function Panel({ title, info, children }: { title: string; info?: GlossaryKey; children: ReactNode }) {
  return (
    <div className="flex flex-col rounded-md border border-line-soft bg-base/30 p-4">
      <span className="eyebrow flex items-center gap-1.5">
        {title} {info && <Info term={info} />}
      </span>
      {children}
    </div>
  );
}

function SectorList({ title, sectors }: { title: string; sectors: RelativeSector[] }) {
  return (
    <div>
      <span className="text-2xs uppercase tracking-[0.14em] text-ink-3">{title}</span>
      <ul className="mt-1">
        {sectors.map((s) => (
          <li key={s.key} className="flex items-baseline justify-between gap-3 py-1 text-sm">
            <span className="truncate text-ink-2">{s.label}</span>
            <span className={`readout ${moveClass(s.relPct, 0.05)}`}>{pts(s.relPct)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EquityConfirmationCard({
  data,
  equities,
  session,
  now,
}: {
  data: DashboardData;
  equities: EquityAnalysis;
  session: SessionInfo;
  now: number;
}) {
  const { participation: p, breadth: b, rotation: r } = equities;
  const freshness = worstFreshness([data.futures.freshness, data.breadth.freshness, data.sectors.freshness]);
  const time = data.sectors.data?.quoteTime ?? data.breadth.data?.quoteTime ?? null;
  const label = time ? quoteLabel(time, session, "cash") : { label: "no data", live: false };
  const vwap = data.breadth.data?.pctAboveVwap ?? null;

  return (
    <Card
      title="Equity Confirmation"
      info="posture"
      badge={<FreshnessBadge freshness={freshness} now={now} label={label.label} live={label.live} />}
    >
      {!equities.posture ? (
        <BlockUnavailable label="Equity data" freshness={freshness} />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
            <div className="min-w-0">
              <span className="eyebrow">Equity posture</span>
              <p className={`mt-1 text-2xl font-semibold leading-tight tracking-tight ${TONE_TEXT[equities.tone]}`}>
                <Why evidence={equities.evidence}>{equities.posture}</Why>
              </p>
              <p className="mt-1 text-xs text-ink-2">{equities.explanation}</p>
            </div>
            {p && (
              <div className="shrink-0 sm:text-right">
                <span className="eyebrow">Index confirmation</span>
                <p className={`mt-1 text-lg font-semibold leading-tight ${TONE_TEXT[p.tone]}`}>
                  <Why evidence={{ ...p.evidence, lines: [p.explanation, ...p.evidence.lines] }} align="right">
                    {p.state}
                  </Why>
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <Panel title="Index participation">
              {!p ? (
                <p className="mt-2 text-sm text-ink-3">Futures unavailable.</p>
              ) : (
                <div className="mt-2">
                  {p.legs.map((leg) => (
                    <Line key={leg.symbol} label={<span className="text-sm font-medium text-ink">{leg.symbol}</span>}>
                      {leg.symbol === "RTY" && (
                        <span className={`readout text-xs ${p.rtyLagging ? "text-warn" : "text-ink-3"}`}>{pts(p.rtyGap)} vs ES</span>
                      )}
                      <span className={`readout text-[15px] font-semibold ${moveClass(leg.changePct)}`}>{pct(leg.changePct)}</span>
                    </Line>
                  ))}
                  {p.rspVsSpy !== null && (
                    <Line label={<>RSP vs SPY <Info term="equalWeight" /></>}>
                      <span className={`readout ${p.rspLagging ? "text-warn" : "text-ink-2"}`}>{pts(p.rspVsSpy)}</span>
                    </Line>
                  )}
                </div>
              )}
            </Panel>

            <Panel title="Breadth" info="breadth">
              {!b ? (
                <p className="mt-2 text-sm text-ink-3">Breadth unavailable.</p>
              ) : (
                <>
                  <div className="mt-2 flex items-baseline justify-between gap-3">
                    <p className="flex items-baseline gap-2">
                      <span className="readout text-3xl font-semibold text-ink">{vwap ?? "—"}%</span>
                      <span className="flex items-center gap-1 text-xs text-ink-3">
                        above VWAP <Info term="vwap" />
                      </span>
                    </p>
                    <span className={`text-sm font-semibold ${TONE_TEXT[b.tone]}`}>
                      <Why
                        evidence={{
                          title: `Why ${sentence(b.state)}?`,
                          lines: [b.explanation, ...b.checks.map((c) => `${c.label}: ${c.value} — ${c.verdict}`)],
                        }}
                        align="right"
                      >
                        {b.state}
                      </Why>
                    </span>
                  </div>
                  <div className="mt-2">
                    {b.checks
                      .filter((c) => c.label !== "Above VWAP")
                      .map((c) => (
                        <Line key={c.label} label={c.label}>
                          <span className="readout text-ink">{c.value}</span>
                          <span className={`w-14 text-xs ${VERDICT[c.verdict].cls}`}>{VERDICT[c.verdict].text}</span>
                        </Line>
                      ))}
                  </div>
                </>
              )}
            </Panel>

            <Panel title="Sector rotation" info="cyclicalRotation">
              {!r ? (
                <p className="mt-2 text-sm text-ink-3">Sector data unavailable.</p>
              ) : (
                <>
                  <p className={`mt-2 text-sm font-semibold ${TONE_TEXT[r.tone]}`}>
                    <Why evidence={{ ...r.evidence, lines: [r.explanation, ...r.evidence.lines] }} align="right">
                      {r.state}
                    </Why>
                  </p>
                  <p className="readout mt-0.5 text-xs text-ink-3">cyclicals {pts(r.spread)} vs defensives, vs SPY</p>
                  <div className="mt-2 grid grid-cols-2 gap-4">
                    <SectorList title="Leaders" sectors={r.leaders} />
                    <SectorList title="Laggards" sectors={r.laggards} />
                  </div>
                </>
              )}
            </Panel>
          </div>
        </>
      )}
    </Card>
  );
}
