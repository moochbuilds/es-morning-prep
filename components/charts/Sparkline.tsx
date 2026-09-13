"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";

import { dateKeyLabel } from "@/lib/format";

import { CHART, ChartTooltip, TooltipRow } from "./common";

/**
 * Single-series trend line with a crosshair. The title around it names the
 * series, so there is no legend box.
 */
export function Sparkline({
  values,
  dates,
  format,
  label,
  width = 300,
  height = 48,
  className = "w-full",
}: {
  values: number[];
  dates?: string[];
  format: (v: number) => string;
  label: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const n = values.length;
  if (n < 2) return null;

  const P = { l: 2, r: 6, t: 6, b: 6 };
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.1 || Math.abs(hi) * 0.01 || 1;
  const x = (i: number) => P.l + (i / (n - 1)) * (width - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (height - P.t - P.b);
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)} ${height - P.b} L${x(0).toFixed(1)} ${height - P.b} Z`;

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setActive(Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1)))));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? n - 1) - 1));
    if (e.key === "ArrowRight") setActive((a) => Math.min(n - 1, (a ?? n - 1) + 1));
  };

  const shown = active ?? n - 1;

  return (
    <div className={`relative ${className}`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto w-full cursor-crosshair focus:outline-none"
        role="img"
        aria-label={`${label}: latest ${format(values[n - 1])}`}
        tabIndex={0}
        onPointerMove={onMove}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(n - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={onKey}
      >
        <path d={area} fill={CHART.accent} fillOpacity={0.1} stroke="none" />
        <path d={line} fill="none" stroke={CHART.accent} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        {active !== null && (
          <line x1={x(active)} x2={x(active)} y1={P.t} y2={height - P.b} stroke={CHART.crosshair} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        )}
        <circle cx={x(shown)} cy={y(values[shown])} r={4} fill={CHART.accent} stroke={CHART.surface} strokeWidth={2} />
      </svg>
      {active !== null && (
        <ChartTooltip xPct={(x(active) / width) * 100}>
          <TooltipRow value={format(values[active])} label={dates?.[active] ? dateKeyLabel(dates[active]) : ""} />
        </ChartTooltip>
      )}
    </div>
  );
}
