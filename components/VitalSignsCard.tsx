"use client";

import type { Analysis, DashboardData, VitalSign } from "@/lib/types";
import { dateKeyLabel } from "@/lib/format";

import { Card } from "./ui/Card";
import { Why } from "./ui/Popover";
import { FreshnessBadge, worstFreshness } from "./ui/StatusBadge";
import { ARROW, TONE_TEXT, VITAL_ALIGNMENT_TONE } from "./ui/tone";

const ARROW_MEANING: Record<VitalSign["key"], Record<VitalSign["arrow"], string>> = {
  rates: { up: "2s10s steepening", down: "2s10s flattening", flat: "slope little changed" },
  credit: { up: "HY spreads widening", down: "HY spreads tightening", flat: "spreads stable" },
  volatility: { up: "VIX rising", down: "VIX falling", flat: "VIX stable" },
};

function Row({ label, vital }: { label: string; vital: VitalSign | null }) {
  // The interpretation lives on hover so the row stays a single glance.
  const evidence = vital && {
    ...vital.evidence,
    lines: [vital.interpretation, ...vital.evidence.lines],
    note: vital.asOf ? `As of ${dateKeyLabel(vital.asOf)}. ${vital.evidence.note ?? ""}` : vital.evidence.note,
  };
  return (
    <div className="border-b border-line-soft py-3.5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink-2">{label}</span>
        {vital && evidence ? (
          <span className="flex items-baseline gap-2">
            <span className={`text-[15px] font-semibold ${TONE_TEXT[vital.tone]}`}>
              <Why evidence={evidence} align="right">
                {vital.state}
              </Why>
            </span>
            <span className="w-4 text-center text-sm text-ink-2" title={ARROW_MEANING[vital.key][vital.arrow]}>
              {ARROW[vital.arrow]}
            </span>
          </span>
        ) : (
          <span className="text-sm text-ink-3">Unavailable</span>
        )}
      </div>
      {vital && <p className="mt-1 text-xs leading-snug text-ink-3">{vital.interpretation}</p>}
    </div>
  );
}

export function VitalSignsCard({
  analysis,
  data,
  now,
}: {
  analysis: Analysis;
  data: DashboardData;
  now: number;
}) {
  const va = analysis.synthesis.vitalAlignment;
  const freshness = worstFreshness([data.rates.freshness, data.credit.freshness, data.volatility.freshness]);

  return (
    <Card
      title="Vital Signs"
      badge={<FreshnessBadge freshness={freshness} now={now} source="Treasury · FRED · Cboe" label="dated on hover" live={false} />}
    >
      <span className="eyebrow">Alignment</span>
      <p className={`mt-1 text-2xl font-semibold leading-tight tracking-tight ${TONE_TEXT[VITAL_ALIGNMENT_TONE[va.state]]}`}>
        {va.state}
      </p>

      <div className="divider mt-4">
        <Row label="Yield curve" vital={analysis.rates?.vital ?? null} />
        <Row label="Credit" vital={analysis.credit?.vital ?? null} />
        <Row label="Volatility" vital={analysis.volatility?.vital ?? null} />
      </div>

      <p className="mt-auto pt-4 text-xs leading-relaxed text-ink-2">{va.text}</p>
    </Card>
  );
}
