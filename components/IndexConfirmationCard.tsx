import type {
  Block,
  ConfirmationClass,
  ConfirmationScore,
  IndexFutures,
  Tone,
} from "@/lib/types";
import { pct } from "@/lib/format";
import { arrowFor } from "@/lib/scoring";

import { Card } from "./ui/Card";
import { BlockUnavailable } from "./ui/StatusBadge";

const CLASS_TONE: Record<ConfirmationClass, Tone> = {
  STRONG: "supportive",
  MODERATE: "neutral",
  WEAK: "restrictive",
  DIVERGENT: "restrictive",
};

const TONE_TEXT: Record<Tone, string> = {
  supportive: "text-pos",
  neutral: "text-ink",
  restrictive: "text-neg",
};

export function IndexConfirmationCard({
  block,
  score,
  now,
}: {
  block: Block<IndexFutures>;
  score: ConfirmationScore | null;
  now: number;
}) {
  return (
    <Card
      title="Index Confirmation"
      tooltip="Whether NQ and RTY corroborate the direction ES is taking."
      freshness={block.freshness}
      now={now}
    >
      {!score ? (
        <BlockUnavailable label="Index futures" freshness={block.freshness} />
      ) : (
        <>
          <span className="eyebrow">Index Tone</span>
          <ul className="mt-2">
            {score.legs.map((leg) => {
              const flat = leg.direction === "flat";
              const up = leg.changePct > 0;
              return (
                <li
                  key={leg.symbol}
                  className="flex items-baseline justify-between gap-3 border-b border-line-soft py-2.5 last:border-b-0"
                >
                  <span className="text-sm font-medium text-ink">
                    {leg.symbol}
                  </span>
                  <span className="flex items-baseline gap-3">
                    <span
                      className={`readout text-sm ${
                        flat ? "text-ink-2" : up ? "text-pos" : "text-neg"
                      }`}
                    >
                      {pct(leg.changePct)}
                    </span>
                    <span
                      className={`w-6 text-right text-sm ${
                        flat ? "text-ink-3" : up ? "text-pos" : "text-neg"
                      }`}
                    >
                      {arrowFor(leg.direction)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="divider mt-4 flex items-baseline justify-between gap-3 pt-3">
            <span className="eyebrow">Confirmation</span>
            <span
              className={`text-sm font-semibold tracking-wide ${
                TONE_TEXT[CLASS_TONE[score.classification]]
              }`}
            >
              {score.classification}
            </span>
          </div>

          <p className="mt-auto pt-3 text-xs leading-relaxed text-ink-2">
            {score.interpretation}
          </p>
        </>
      )}
    </Card>
  );
}
