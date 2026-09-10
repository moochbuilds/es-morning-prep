import type { DashboardData, Regime, RiskLevel, TodayRead as Read, Tone } from "@/lib/types";
import { etTime } from "@/lib/format";

import { Card } from "./ui/Card";
import { ScoreBar } from "./ui/ScoreBar";

const REGIME_STYLE: Record<Regime, string> = {
  "RISK-ON": "text-pos",
  NEUTRAL: "text-ink",
  "RISK-OFF": "text-neg",
};

const RISK_STYLE: Record<RiskLevel, string> = {
  LOW: "text-pos",
  MEDIUM: "text-warn",
  HIGH: "text-neg",
};

/** Colours a pillar reading by what it means for equities, not alphabetically. */
function pillarTone(value: string): Tone {
  const v = value.toUpperCase();
  if (/VERY STRONG|STRONG RISK-ON|^STRONG$|RISK-ON|^LOW$/.test(v)) return "supportive";
  if (/VERY WEAK|^WEAK$|DEFENSIVE|DIVERGENT|ELEVATED|^HIGH$/.test(v)) return "restrictive";
  return "neutral";
}

const TONE_TEXT: Record<Tone, string> = {
  supportive: "text-pos",
  neutral: "text-ink-2",
  restrictive: "text-neg",
};

function Pillar({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line-soft py-2 last:border-b-0">
      <span className="text-xs text-ink-3">{label}</span>
      <span className={`text-xs font-semibold ${TONE_TEXT[pillarTone(value)]}`}>
        {value}
      </span>
    </div>
  );
}

export function TodayRead({
  data,
  read,
  now,
}: {
  data: DashboardData;
  read: Read | null;
  now: number;
}) {
  const eventRisk = data.derived.eventRisk.level;

  return (
    <Card
      title="Today's Read"
      tooltip="Synthesis of breadth, rotation, stress and index confirmation into a single market regime."
      now={now}
      emphasis
    >
      {!read ? (
        <ReadSkeleton />
      ) : (
        <div className="flex flex-1 flex-col">
          {/* Headline row */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <span className="eyebrow">Regime</span>
              <p
                className={`mt-1 text-2xl font-semibold tracking-tight ${REGIME_STYLE[read.regime]}`}
              >
                {read.regime}
              </p>
            </div>
            <div>
              <span className="eyebrow">Confidence</span>
              <p className="readout mt-1 text-2xl font-semibold text-ink">
                {read.confidence}%
              </p>
            </div>
            <div>
              <span className="eyebrow">Event Risk</span>
              <p
                className={`mt-1 text-2xl font-semibold tracking-tight ${RISK_STYLE[eventRisk]}`}
              >
                {eventRisk}
              </p>
            </div>
          </div>

          {/* Confidence uses the same bar language as the other 0-100 scores;
              the number itself is already in the headline row above. */}
          <div className="mt-3.5">
            <ScoreBar
              value={read.confidence}
              classification=""
              showValue={false}
              tone={
                read.regime === "RISK-ON"
                  ? "supportive"
                  : read.regime === "RISK-OFF"
                    ? "restrictive"
                    : "neutral"
              }
            />
          </div>

          {/* Pillars */}
          <div className="divider mt-4 pt-1">
            <Pillar label="Breadth" value={read.breadth} />
            <Pillar label="Rotation" value={read.rotation} />
            <Pillar label="Stress" value={read.stress} />
            <Pillar label="Confirmation" value={read.confirmation} />
          </div>

          {/* Interpretation */}
          <p className="mt-4 text-sm leading-relaxed text-ink-2">
            {read.summary}
          </p>

          <div className="mt-auto pt-4">
            <div className="rounded-md border border-line bg-base/40 px-3.5 py-3">
              <span className="eyebrow text-warn/80">Main Risk</span>
              <p className="mt-1 text-xs leading-relaxed text-ink-2">
                {read.mainRisk}
              </p>
            </div>
            <p className="mt-2.5 text-2xs text-ink-3">
              {read.generatedBy === "ai" ? "AI interpretation" : "Rule-based"} ·{" "}
              {etTime(read.generatedAt)} ET
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Shown for the moment between first paint and the AI response landing. */
function ReadSkeleton() {
  return (
    <div className="flex flex-1 animate-pulse flex-col gap-4" aria-busy="true">
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <div className="h-2 w-16 rounded bg-line" />
            <div className="mt-2 h-6 w-24 rounded bg-line" />
          </div>
        ))}
      </div>
      <div className="h-1.5 rounded-full bg-line" />
      <div className="space-y-2.5 pt-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-3 rounded bg-line-soft" />
        ))}
      </div>
      <div className="mt-3 space-y-2">
        <div className="h-3 rounded bg-line-soft" />
        <div className="h-3 w-4/5 rounded bg-line-soft" />
      </div>
    </div>
  );
}
