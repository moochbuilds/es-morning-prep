import type {
  Block,
  Earnings,
  EarningsEvent,
  EarningsResult,
  EarningsSlot,
  GuidanceGrade,
  Importance,
  MarginGrade,
  ResultGrade,
} from "@/lib/types";
import { pct } from "@/lib/format";
import { primaryCatalyst } from "@/lib/scoring";

import { Card } from "./ui/Card";
import { BlockUnavailable } from "./ui/StatusBadge";

const IMPORTANCE_STYLE: Record<Importance, string> = {
  HIGH: "text-neg",
  MED: "text-warn",
  LOW: "text-ink-3",
};

/** Beat/raise reads green, miss/lower red, in-line neutral, N/A muted. */
function gradeStyle(grade: ResultGrade | GuidanceGrade | MarginGrade): string {
  switch (grade) {
    case "BEAT":
    case "RAISED":
    case "BETTER":
      return "text-pos";
    case "MISS":
    case "LOWERED":
    case "WORSE":
      return "text-neg";
    case "N/A":
      return "text-ink-3";
    default:
      return "text-ink-2";
  }
}

function SlotList({
  slot,
  events,
}: {
  slot: EarningsSlot;
  events: EarningsEvent[];
}) {
  return (
    <div>
      <span className="eyebrow">{slot}</span>
      {events.length === 0 ? (
        <p className="mt-2 text-xs text-ink-3">None scheduled.</p>
      ) : (
        <ul className="mt-2">
          {events.map((e) => (
            <li
              key={e.ticker}
              className="flex items-baseline justify-between gap-3 border-b border-line-soft py-1.5 last:border-b-0"
            >
              <span className="flex items-baseline gap-2 truncate">
                <span className="readout text-sm font-medium text-ink">
                  {e.ticker}
                </span>
                <span className="truncate text-2xs text-ink-3">{e.sector}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-3">
                {e.marketCapUsd !== null && (
                  <span className="readout text-2xs text-ink-3">
                    {marketCap(e.marketCapUsd)}
                  </span>
                )}
                <span
                  className={`w-8 text-right text-2xs font-semibold tracking-wider ${IMPORTANCE_STYLE[e.importance]}`}
                >
                  {e.importance}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Renders nothing when the provider didn't report the metric. */
function GradeRow({
  label,
  grade,
}: {
  label: string;
  grade: ResultGrade | GuidanceGrade | MarginGrade;
}) {
  if (grade === "N/A") return null;
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-2xs text-ink-3">{label}</span>
      <span className={`text-2xs font-semibold ${gradeStyle(grade)}`}>
        {grade}
      </span>
    </div>
  );
}

function ReportedCard({
  result,
  takeaway,
  aiPending,
  aiConfigured,
}: {
  result: EarningsResult;
  takeaway?: string;
  aiPending: boolean;
  aiConfigured: boolean;
}) {
  return (
    <article className="flex flex-col rounded-md border border-line-soft bg-base/40 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-baseline gap-2">
          <span className="readout text-sm font-semibold text-ink">
            {result.ticker}
          </span>
          <span className="text-2xs text-ink-3">{result.sector}</span>
        </span>
        {result.stockReactionPct !== null && (
          <span
            className={`readout text-sm font-semibold ${
              result.stockReactionPct >= 0 ? "text-pos" : "text-neg"
            }`}
          >
            {pct(result.stockReactionPct, 1)}
          </span>
        )}
      </div>

      {/* Only metrics the provider actually reported are rendered — no N/A rows. */}
      <div className="mt-3">
        <GradeRow label="Revenue" grade={result.revenue} />
        <GradeRow label="EPS" grade={result.eps} />
        <GradeRow label="Guidance" grade={result.guidance} />
        <GradeRow label="Margins" grade={result.margins} />
      </div>

      {result.epsDetail && (
        <p className="readout mt-1.5 text-2xs text-ink-3">
          EPS {result.epsDetail.actual.toFixed(2)} vs{" "}
          {result.epsDetail.consensus.toFixed(2)} est
          <span
            className={
              result.epsDetail.surprisePct >= 0 ? " text-pos" : " text-neg"
            }
          >
            {" "}
            ({result.epsDetail.surprisePct >= 0 ? "+" : ""}
            {result.epsDetail.surprisePct.toFixed(1)}%)
          </span>
        </p>
      )}

      {/* The takeaway block only exists when there is a takeaway to show. */}
      {(takeaway || aiPending) && aiConfigured && (
        <div className="divider mt-3 pt-3">
          <span className="eyebrow">Takeaway</span>
          {takeaway ? (
            <p className="mt-1 text-xs leading-relaxed text-ink-2">{takeaway}</p>
          ) : (
            <div className="mt-2 animate-pulse space-y-1.5" aria-busy="true">
              <div className="h-2.5 rounded bg-line-soft" />
              <div className="h-2.5 w-3/4 rounded bg-line-soft" />
            </div>
          )}
        </div>
      )}
    </article>
  );
}

/** "$3.2T" / "$780B" — compact, and honest about being a cap not a weight. */
function marketCap(usd: number): string {
  if (usd >= 1e12) return `$${(usd / 1e12).toFixed(usd >= 1e13 ? 0 : 1)}T`;
  return `$${Math.round(usd / 1e9)}B`;
}

export function EarningsCard({
  block,
  takeaways,
  aiPending,
  aiConfigured,
  now,
}: {
  block: Block<Earnings>;
  takeaways: Record<string, string>;
  aiPending: boolean;
  aiConfigured: boolean;
  now: number;
}) {
  const earnings = block.data;
  const catalyst = primaryCatalyst(earnings?.today);

  return (
    <Card
      title="Earnings"
      tooltip="Only reports large enough to move the index, a major sector, or overall risk sentiment."
      freshness={block.freshness}
      now={now}
    >
      {!earnings ? (
        <BlockUnavailable label="Earnings data" freshness={block.freshness} />
      ) : (
        <div
          className={`grid gap-6 ${
            // Don't reserve two thirds of the card for a column that is empty
            // on days when nothing has reported yet.
            earnings.reported.length > 0
              ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]"
              : "lg:grid-cols-2"
          }`}
        >
          {/* Today */}
          <div>
            <h3 className="text-sm font-medium text-ink">Earnings Today</h3>
            <div className="mt-3 space-y-5">
              <SlotList
                slot="PRE-MARKET"
                events={earnings.today.filter((e) => e.slot === "PRE-MARKET")}
              />
              <SlotList
                slot="AFTER CLOSE"
                events={earnings.today.filter((e) => e.slot === "AFTER CLOSE")}
              />
            </div>

            {catalyst && (
              <div className="mt-5 rounded-md border border-line bg-surface-2 px-3.5 py-3">
                <span className="eyebrow">Primary Catalyst</span>
                <p className="readout mt-1 text-lg font-semibold text-ink">
                  {catalyst.ticker}
                </p>
                <p className="mt-0.5 text-2xs leading-relaxed text-ink-3">
                  {catalyst.company} · {catalyst.sector}
                  {catalyst.marketCapUsd !== null &&
                    ` · ${marketCap(catalyst.marketCapUsd)} cap`}
                  {" · "}
                  {catalyst.slot === "PRE-MARKET" ? "pre-market" : "after close"}
                </p>
              </div>
            )}
          </div>

          {/* Already reported */}
          <div>
            <h3 className="text-sm font-medium text-ink">
              Earnings Already Reported
            </h3>
            {earnings.reported.length === 0 ? (
              <p className="mt-3 text-xs text-ink-3">
                No major reports since the last close.
              </p>
            ) : (
              <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {earnings.reported.map((r) => (
                  <ReportedCard
                    key={r.ticker}
                    result={r}
                    takeaway={takeaways[r.ticker]}
                    aiPending={aiPending}
                    aiConfigured={aiConfigured}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
