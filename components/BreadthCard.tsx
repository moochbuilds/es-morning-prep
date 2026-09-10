import type { Block, Breadth, BreadthScore, Tone } from "@/lib/types";
import { pct, ratio } from "@/lib/format";
import { equalWeightLabel } from "@/lib/scoring";

import { Card } from "./ui/Card";
import { ScoreBar } from "./ui/ScoreBar";
import { BlockUnavailable } from "./ui/StatusBadge";

function toneFor(score: number): Tone {
  if (score >= 60) return "supportive";
  if (score <= 40) return "restrictive";
  return "neutral";
}

export function BreadthCard({
  block,
  score,
  now,
}: {
  block: Block<Breadth>;
  score: BreadthScore | null;
  now: number;
}) {
  const breadth = block.data;

  return (
    <Card
      title="Breadth"
      tooltip="Measures how broadly S&P 500 stocks are participating in the index move."
      freshness={block.freshness}
      now={now}
    >
      {!breadth || !score ? (
        <BlockUnavailable label="Breadth" freshness={block.freshness} />
      ) : (
        <>
          <ScoreBar
            value={score.score}
            classification={score.classification}
            tone={toneFor(score.score)}
          />

          {/* Headline indicator gets the most weight visually. */}
          <div className="divider mt-4 flex items-end justify-between pt-4">
            <div>
              <span className="eyebrow">Above VWAP</span>
              <p className="readout mt-1 text-3xl font-semibold text-ink">
                {breadth.pctAboveVwap}%
              </p>
            </div>
            <div className="text-right">
              <span className="eyebrow">A / D</span>
              <p className="readout mt-1 text-xl font-semibold text-ink">
                {ratio(breadth.advanceDeclineRatio)}
              </p>
              <p className="mt-0.5 text-2xs text-ink-3">
                {breadth.advancers} adv · {breadth.decliners} dec
              </p>
            </div>
          </div>

          <div className="divider mt-4 flex items-baseline justify-between gap-3 pt-3">
            <span className="text-xs text-ink-3">RSP vs SPY</span>
            <span className="flex items-baseline gap-2.5">
              <span
                className={`readout text-sm ${
                  breadth.rspVsSpyPct >= 0 ? "text-pos" : "text-neg"
                }`}
              >
                {pct(breadth.rspVsSpyPct)}
              </span>
              <span className="w-[76px] text-right text-2xs font-semibold tracking-wider text-ink-2">
                {equalWeightLabel(breadth.rspVsSpyPct)}
              </span>
            </span>
          </div>

          <p className="mt-auto pt-4 text-xs leading-relaxed text-ink-2">
            {score.conclusion}
          </p>
        </>
      )}
    </Card>
  );
}
