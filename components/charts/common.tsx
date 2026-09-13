import type { ReactNode } from "react";

/**
 * Chart palette. "Today" takes the reference categorical slot-1 blue; the
 * comparison series is deliberately gray (emphasis, not identity). Status
 * colours are reserved for interpretation text and never used on marks.
 * Validated for the dark surface: CVD ΔE 15.1, both marks ≥ 3:1 contrast.
 */
export const CHART = {
  accent: "#3987E5",
  compare: "#6E7683",
  grid: "#20252D",
  crosshair: "#3A414C",
  axis: "#6E7683",
  surface: "#13161B",
} as const;

/** Clean axis ticks: 3-4 round values spanning [lo, hi]. */
export function niceScale(lo: number, hi: number, maxTicks = 4) {
  if (!(hi > lo)) {
    lo -= 1;
    hi += 1;
  }
  const raw = (hi - lo) / (maxTicks - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  const digits = step >= 1 ? 0 : Math.abs(step * 10 - Math.round(step * 10)) < 1e-9 ? 1 : 2;
  return { min, max, ticks, digits };
}

export function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

/** Tooltip positioned over a chart at a horizontal percentage, kept inside the frame. */
export function ChartTooltip({ xPct, children }: { xPct: number; children: ReactNode }) {
  const shift = xPct < 20 ? "0%" : xPct > 80 ? "-100%" : "-50%";
  return (
    <div
      className="pointer-events-none absolute top-0 z-20 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-2xs text-ink-2 shadow-lg shadow-black/50"
      style={{ left: `${xPct}%`, transform: `translate(${shift}, calc(-100% - 6px))` }}
    >
      {children}
    </div>
  );
}

/** "Values lead, labels follow": the number is primary, the series name muted. */
export function TooltipRow({ color, value, label }: { color?: string; value: string; label: string }) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      {color && <span className="inline-block h-0.5 w-2.5 rounded-full" style={{ background: color }} />}
      <span className="readout font-semibold text-ink">{value}</span>
      <span className="text-ink-3">{label}</span>
    </span>
  );
}
