import type { Tone } from "@/lib/types";

const TONE_TEXT: Record<Tone, string> = {
  supportive: "text-pos",
  neutral: "text-ink",
  restrictive: "text-neg",
};

/**
 * One label / value / annotation row.
 *
 * `tone` is interpretation, not arithmetic sign — a -6bp move in the 10Y is
 * supportive for equities and renders green even though the number is negative.
 */
export function Metric({
  label,
  value,
  detail,
  tone = "neutral",
  detailTone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: Tone;
  detailTone?: Tone;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-xs text-ink-3">{label}</span>
      <span className="flex items-baseline gap-2.5">
        <span className="readout text-sm text-ink">{value}</span>
        {detail && (
          <span
            className={`readout w-[76px] text-right text-xs ${
              TONE_TEXT[detailTone ?? tone]
            }`}
          >
            {detail}
          </span>
        )}
      </span>
    </div>
  );
}
