"use client";

import type { Analysis, CatalystView, Interpretation, Tone } from "@/lib/types";
import { etTime } from "@/lib/format";
import { dayShort } from "@/lib/engine/session";

import { Card } from "./ui/Card";
import { Info, Why } from "./ui/Popover";
import { ALIGNMENT_TONE, RISK_TONE, SEVERITY_TONE, TONE_BORDER, TONE_DOT, TONE_TEXT } from "./ui/tone";

function Driver({ label, text, tone }: { label: string; text: string; tone: Tone }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 border-b border-line-soft py-2.5 last:border-b-0 sm:grid-cols-[8.5rem_1fr]">
      <span className="text-xs text-ink-3">{label}</span>
      <span className="flex items-baseline gap-2 text-sm text-ink">
        <span className={`h-2 w-2 shrink-0 translate-y-[-1px] rounded-full ${TONE_DOT[tone]}`} />
        {text}
      </span>
    </div>
  );
}

export function TodayRead({
  analysis,
  narrative,
  catalysts,
}: {
  analysis: Analysis;
  narrative: Pick<Interpretation, "text" | "generatedBy" | "generatedAt">;
  catalysts: CatalystView;
}) {
  const s = analysis.synthesis;
  const risk = catalysts.eventRisk.level;
  const riskDay = catalysts.sessionIsToday ? "Today" : dayShort(catalysts.sessionDate);
  const topDivergence = s.divergences[0];
  const alignmentEvidence = { ...s.alignment.evidence, lines: [s.alignment.text, ...s.alignment.evidence.lines] };

  return (
    <Card title="Today's Read" emphasis>
      {/* The three readings the eye should hit first */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <span className="eyebrow">Market backdrop</span>
          <p className={`mt-1 text-2xl font-semibold leading-tight tracking-tight ${TONE_TEXT[s.backdrop.tone]}`}>
            {s.backdrop.label}
          </p>
        </div>
        <div>
          <span className="eyebrow flex items-center gap-1.5">
            Alignment <Info term="alignment" align="right" />
          </span>
          <p className={`mt-1 text-2xl font-semibold leading-tight ${TONE_TEXT[ALIGNMENT_TONE[s.alignment.state]]}`}>
            <Why evidence={alignmentEvidence} align="right">
              {s.alignment.state}
            </Why>
          </p>
        </div>
        <div>
          <span className="eyebrow flex items-center gap-1.5">
            Event risk · {riskDay} <Info term="eventRisk" align="right" />
          </span>
          <p className={`mt-1 text-2xl font-semibold leading-tight ${TONE_TEXT[RISK_TONE[risk]]}`}>{risk}</p>
        </div>
      </div>

      {/* What it means for the ES environment */}
      <div className={`mt-4 rounded-md border border-l-2 border-line bg-base/40 px-4 py-3 ${TONE_BORDER[s.backdrop.tone]}`}>
        <span className="eyebrow">ES context</span>
        <p className="mt-1 text-sm leading-relaxed text-ink">{s.esContext}</p>
      </div>

      <div className="mt-2">
        <Driver label="Main tailwind" text={s.tailwind ?? "None clear"} tone={s.tailwind ? "constructive" : "neutral"} />
        <Driver
          label="Main headwind"
          text={s.headwind ?? "None significant"}
          tone={s.headwind ? (s.backdrop.tone === "stressed" ? "stressed" : "caution") : "neutral"}
        />
        <Driver
          label="Main divergence"
          text={s.divergence ?? "None significant"}
          tone={topDivergence ? SEVERITY_TONE[topDivergence.severity] : "neutral"}
        />
      </div>

      <p className="divider mt-2 pt-3 text-sm leading-relaxed text-ink-2">{narrative.text}</p>

      <div className="divider mt-4 pt-3">
        <span className="eyebrow">What changed · since the prior session</span>
        <ul className="mt-1">
          {s.whatChanged.map((w) => (
            <li
              key={w.market}
              className="grid grid-cols-[5.5rem_1fr] items-baseline gap-3 border-b border-line-soft py-2 last:border-b-0"
            >
              <span className="text-xs text-ink-3">{w.market}</span>
              <span className="text-sm">
                <span className="readout text-ink">{w.fact}</span>
                <span className={TONE_TEXT[w.tone]}> → {w.implication}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-auto pt-4 text-2xs text-ink-3">
        {narrative.generatedBy === "ai" ? "AI explanation of the engine's classifications" : "Rule-based explanation"} ·{" "}
        {etTime(narrative.generatedAt)} ET · context, not a trade signal
      </p>
    </Card>
  );
}
