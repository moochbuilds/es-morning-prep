import type { Tone } from "@/lib/types";

const FILL: Record<Tone, string> = {
  supportive: "bg-pos",
  neutral: "bg-neutral",
  restrictive: "bg-neg",
};

const TEXT: Record<Tone, string> = {
  supportive: "text-pos",
  neutral: "text-ink",
  restrictive: "text-neg",
};

interface ScoreBarProps {
  /** 0-100. */
  value: number;
  classification: string;
  tone: Tone;
  /** Day-over-day move in the score, rendered next to the number. */
  change?: number | null;
  /** Shown when the bar is a confidence reading rather than a 0-100 score. */
  suffix?: string;
  size?: "sm" | "lg";
  /** Track only — for places that already show the number above the bar. */
  showValue?: boolean;
}

/**
 * The single visual language for every 0-100 reading on the page: Sector
 * Rotation, Market Stress, and Today's Read confidence all use this so the
 * numbers are directly comparable at a glance.
 */
export function ScoreBar({
  value,
  classification,
  tone,
  change,
  suffix = "/ 100",
  size = "sm",
  showValue = true,
}: ScoreBarProps) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div>
      <div
        className={`flex items-baseline justify-between gap-3 ${showValue ? "" : "hidden"}`}
      >
        <div className="flex items-baseline gap-2">
          <span
            className={`readout font-semibold ${TEXT[tone]} ${
              size === "lg" ? "text-4xl" : "text-3xl"
            }`}
          >
            {Math.round(clamped)}
          </span>
          <span className="text-2xs text-ink-3">{suffix}</span>
          {change !== undefined && change !== null && (
            <span
              className={`readout text-2xs ${
                change > 0 ? "text-pos" : change < 0 ? "text-neg" : "text-ink-3"
              }`}
            >
              {change > 0 ? "+" : ""}
              {change}
            </span>
          )}
        </div>
        <span className={`text-xs font-semibold tracking-wide ${TEXT[tone]}`}>
          {classification}
        </span>
      </div>

      <div
        className={`relative h-1.5 overflow-hidden rounded-full bg-neutral-dim ${showValue ? "mt-2.5" : ""}`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${FILL[tone]}`}
          style={{ width: `${clamped}%` }}
        />
        {/* Midpoint tick — anchors the eye without a full axis. */}
        <div className="absolute left-1/2 top-0 h-full w-px bg-base/70" />
      </div>
    </div>
  );
}
