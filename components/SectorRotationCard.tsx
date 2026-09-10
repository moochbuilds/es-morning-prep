import type { Block, RotationScore, SectorQuote, Sectors, Tone } from "@/lib/types";
import { pct } from "@/lib/format";
import { sectorArrow } from "@/lib/scoring";

import { Card } from "./ui/Card";
import { ScoreBar } from "./ui/ScoreBar";
import { BlockUnavailable } from "./ui/StatusBadge";

function toneFor(score: number): Tone {
  if (score >= 55) return "supportive";
  if (score <= 45) return "restrictive";
  return "neutral";
}

function SectorRow({ sector }: { sector: SectorQuote }) {
  const up = sector.changePct > 0;
  const flat = Math.abs(sector.changePct) < 0.1;
  return (
    <li className="flex items-baseline justify-between gap-3 py-1">
      <span className="truncate text-xs text-ink-2">{sector.label}</span>
      <span className="flex shrink-0 items-baseline gap-2">
        <span
          className={`readout text-xs ${
            flat ? "text-ink-3" : up ? "text-pos" : "text-neg"
          }`}
        >
          {pct(sector.changePct)}
        </span>
        <span
          className={`w-5 text-right text-xs ${
            flat ? "text-ink-3" : up ? "text-pos" : "text-neg"
          }`}
        >
          {sectorArrow(sector.changePct)}
        </span>
      </span>
    </li>
  );
}

export function SectorRotationCard({
  block,
  score,
  now,
}: {
  block: Block<Sectors>;
  score: RotationScore | null;
  now: number;
}) {
  return (
    <Card
      title="Sector Rotation"
      tooltip="Estimates whether leadership favours cyclical/risk assets or defensive sectors."
      freshness={block.freshness}
      now={now}
    >
      {!score ? (
        <BlockUnavailable label="Sector data" freshness={block.freshness} />
      ) : (
        <>
          <ScoreBar
            value={score.score}
            classification={score.classification}
            tone={toneFor(score.score)}
            change={score.change}
          />

          <div className="divider mt-4 grid grid-cols-1 gap-x-6 gap-y-3 pt-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div>
              <span className="eyebrow">Leaders</span>
              <ul className="mt-1.5">
                {score.leaders.map((s) => (
                  <SectorRow key={s.key} sector={s} />
                ))}
              </ul>
            </div>
            <div>
              <span className="eyebrow">Laggards</span>
              <ul className="mt-1.5">
                {score.laggards.map((s) => (
                  <SectorRow key={s.key} sector={s} />
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-auto pt-4">
            {score.change !== null && (
              <p className="text-2xs text-ink-3">
                Change vs prior session:{" "}
                <span
                  className={
                    score.change > 0
                      ? "text-pos"
                      : score.change < 0
                        ? "text-neg"
                        : "text-ink-3"
                  }
                >
                  {score.change > 0 ? "+" : ""}
                  {score.change}
                </span>
              </p>
            )}
            <p className="mt-1.5 text-xs leading-relaxed text-ink-2">
              {score.conclusion}
            </p>
          </div>
        </>
      )}
    </Card>
  );
}
