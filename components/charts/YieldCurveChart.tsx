"use client";

import { useState } from "react";

import { bp } from "@/lib/format";

import { CHART, ChartTooltip, LegendKey, TooltipRow, niceScale } from "./common";

const MATURITY_YEARS: Record<string, number> = { "3M": 0.25, "2Y": 2, "5Y": 5, "10Y": 10, "30Y": 30 };

const W = 320;
const H = 128;
const P = { l: 38, r: 12, t: 10, b: 22 };

/**
 * Treasury curve, today vs one week ago — exactly two lines, so steepening
 * and flattening are visible at a glance. Tenors sit on a log-maturity axis so
 * the slope between them is honest.
 */
export function YieldCurveChart({
  tenors,
  today,
  weekAgo,
  todayLabel,
  weekAgoLabel,
}: {
  tenors: string[];
  today: number[];
  weekAgo: number[];
  todayLabel: string;
  weekAgoLabel: string;
}) {
  const [active, setActive] = useState<number | null>(null);

  const logs = tenors.map((t) => Math.log(MATURITY_YEARS[t] ?? 1));
  const span = logs[logs.length - 1] - logs[0] || 1;
  const x = (i: number) => P.l + ((logs[i] - logs[0]) / span) * (W - P.l - P.r);

  const all = [...today, ...weekAgo];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo) * 0.08 || 0.1;
  // Five candidate ticks keeps the axis tight enough that the gap between
  // the two curves — the whole point of the chart — stays visible.
  const scale = niceScale(lo - pad, hi + pad, 5);
  const y = (v: number) => P.t + (1 - (v - scale.min) / (scale.max - scale.min)) * (H - P.t - P.b);
  const line = (vals: number[]) =>
    vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  const zones = tenors.map((_, i) => {
    const from = i === 0 ? P.l - 12 : (x(i - 1) + x(i)) / 2;
    const to = i === tenors.length - 1 ? W - P.r + 12 : (x(i) + x(i + 1)) / 2;
    return { from, to };
  });

  return (
    <figure>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-ink-3">
        <LegendKey color={CHART.accent} label={todayLabel} />
        <LegendKey color={CHART.compare} label={weekAgoLabel} />
      </figcaption>

      <div className="relative mt-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`Treasury yield curve, ${todayLabel} versus ${weekAgoLabel}`}
        >
          {scale.ticks.map((t) => (
            <g key={t}>
              <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke={CHART.grid} strokeWidth={1} />
              <text x={P.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={9} fill={CHART.axis} className="tabular-nums">
                {t.toFixed(scale.digits)}%
              </text>
            </g>
          ))}
          {tenors.map((t, i) => (
            <text key={t} x={x(i)} y={H - 6} textAnchor="middle" fontSize={9} fill={CHART.axis}>
              {t}
            </text>
          ))}

          {active !== null && (
            <line x1={x(active)} x2={x(active)} y1={P.t} y2={H - P.b} stroke={CHART.crosshair} strokeWidth={1} />
          )}

          <path d={line(weekAgo)} fill="none" stroke={CHART.compare} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <path d={line(today)} fill="none" stroke={CHART.accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {weekAgo.map((v, i) => (
            <circle key={`w${i}`} cx={x(i)} cy={y(v)} r={3.5} fill={CHART.compare} stroke={CHART.surface} strokeWidth={2} />
          ))}
          {today.map((v, i) => (
            <circle key={`t${i}`} cx={x(i)} cy={y(v)} r={4} fill={CHART.accent} stroke={CHART.surface} strokeWidth={2} />
          ))}

          {zones.map((z, i) => (
            <rect
              key={i}
              x={z.from}
              y={P.t}
              width={z.to - z.from}
              height={H - P.t - P.b}
              fill="transparent"
              tabIndex={0}
              aria-label={`${tenors[i]}: ${today[i].toFixed(2)}% today, ${weekAgo[i].toFixed(2)}% a week ago`}
              className="cursor-crosshair focus:outline-none"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            />
          ))}
        </svg>

        {active !== null && (
          <ChartTooltip xPct={(x(active) / W) * 100}>
            <span className="mb-1 block font-medium text-ink-2">{tenors[active]}</span>
            <TooltipRow color={CHART.accent} value={`${today[active].toFixed(2)}%`} label={todayLabel} />
            <TooltipRow color={CHART.compare} value={`${weekAgo[active].toFixed(2)}%`} label={weekAgoLabel} />
            <span className="mt-1 block text-ink-3">
              Change {bp(Math.round((today[active] - weekAgo[active]) * 100))}
            </span>
          </ChartTooltip>
        )}
      </div>

      <table className="sr-only">
        <caption>Treasury yields by tenor</caption>
        <thead>
          <tr>
            <th>Tenor</th>
            <th>{todayLabel}</th>
            <th>{weekAgoLabel}</th>
          </tr>
        </thead>
        <tbody>
          {tenors.map((t, i) => (
            <tr key={t}>
              <td>{t}</td>
              <td>{today[i].toFixed(2)}%</td>
              <td>{weekAgo[i].toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
