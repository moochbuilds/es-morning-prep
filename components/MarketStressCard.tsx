import type { DashboardData } from "@/lib/types";
import { bp, pct, yieldPct } from "@/lib/format";
import {
  creditDirectionLabel,
  creditTone,
  curveDirectionLabel,
  rateTone,
  vixTone,
} from "@/lib/scoring";

import { Card } from "./ui/Card";
import { Metric } from "./ui/Metric";
import { ScoreBar } from "./ui/ScoreBar";
import { BlockUnavailable } from "./ui/StatusBadge";

export function MarketStressCard({
  data,
  now,
}: {
  data: DashboardData;
  now: number;
}) {
  const stress = data.derived.stress;
  const rates = data.rates.data;
  const vol = data.volatility.data;
  const credit = data.credit.data;

  // Least-fresh input governs the badge — never imply the composite is live
  // when one of its legs is stale.
  const freshness = [data.volatility, data.rates, data.credit].sort(
    (a, b) =>
      rank(b.freshness.status) - rank(a.freshness.status),
  )[0].freshness;

  return (
    <Card
      title="Market Stress"
      tooltip="Composite reading based primarily on volatility, Treasury yields and credit conditions."
      freshness={freshness}
      now={now}
    >
      {!stress ? (
        <BlockUnavailable label="Market stress" freshness={freshness} />
      ) : (
        <>
          <ScoreBar
            value={stress.score}
            classification={stress.classification}
            tone={stress.tone}
          />

          <div className="divider mt-4 pt-2">
            {rates && (
              <Metric
                label="10Y"
                value={yieldPct(rates.us10y)}
                detail={bp(rates.us10yChangeBp)}
                detailTone={rateTone(rates.us10yChangeBp)}
              />
            )}
            {vol && (
              <Metric
                label="VIX"
                value={vol.vix.toFixed(1)}
                detail={pct(vol.vixChangePct, 1)}
                detailTone={vixTone(vol.vixChangePct)}
              />
            )}
            {credit && (
              <Metric
                label="HY Spread"
                value={`${credit.hySpreadBp} bp`}
                detail={creditDirectionLabel(credit.hySpreadChangeBp)}
                detailTone={creditTone(credit.hySpreadChangeBp)}
              />
            )}
            {rates && (
              <Metric
                label="2s10s"
                value={bp(rates.curve2s10sBp)}
                detail={curveDirectionLabel(rates.curve2s10sChangeBp)}
                detailTone="neutral"
              />
            )}
          </div>

          {credit?.dailyOnly && (
            <p className="mt-2 text-2xs text-ink-3">
              HY spread is a daily series — as of {credit.asOfDate}.
            </p>
          )}

          {/* Shows how the composite was actually built. The weights live in
              /config/thresholds.ts and are meant to be tuned. */}
          <div className="divider mt-4 pt-3">
            <span className="eyebrow">Composite Inputs</span>
            <ul className="mt-2 space-y-1.5">
              {stress.components.map((c) => (
                <li key={c.label} className="flex items-center gap-3">
                  <span className="w-12 shrink-0 text-2xs text-ink-3">
                    {c.label}
                  </span>
                  <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-neutral-dim">
                    <span
                      className="absolute left-0 top-0 h-full rounded-full bg-ink-3/70"
                      style={{ width: `${Math.round(c.score)}%` }}
                    />
                  </span>
                  <span className="readout w-6 shrink-0 text-right text-2xs text-ink-2">
                    {Math.round(c.score)}
                  </span>
                  <span className="readout w-9 shrink-0 text-right text-2xs text-ink-3">
                    {Math.round(c.weight * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="divider mt-auto pt-3">
            <span className="eyebrow">Conclusion</span>
            <p className="mt-1 text-xs leading-relaxed text-ink-2">
              {stress.conclusion}
            </p>
          </div>
        </>
      )}
    </Card>
  );
}

function rank(status: string): number {
  return { LIVE: 0, DELAYED: 1, STALE: 2, UNAVAILABLE: 3 }[status] ?? 0;
}
