"use client";

import type { DashboardData, RiskLevel } from "@/lib/types";
import { ago, etLongDate, etTimeWithSeconds, pct } from "@/lib/format";
import { arrowFor, directionOf } from "@/lib/scoring";

const RISK_STYLE: Record<RiskLevel, string> = {
  LOW: "border-pos/30 bg-pos-dim text-pos",
  MEDIUM: "border-warn/30 bg-warn-dim text-warn",
  HIGH: "border-neg/30 bg-neg-dim text-neg",
};

export function DashboardHeader({
  data,
  now,
  onRefresh,
  refreshing,
}: {
  data: DashboardData;
  now: number;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const futures = data.futures.data;
  const legs = futures ? [futures.es, futures.nq, futures.rty] : [];
  const eventRisk = data.derived.eventRisk.level;

  // Named per section, so a partly-wired dashboard can't be mistaken for a
  // fully live one (or vice versa).
  const mockSections = (
    [
      ["Catalysts", data.calendar],
      ["Breadth", data.breadth],
      ["Stress", data.rates],
      ["Rotation", data.sectors],
      ["Futures", data.futures],
      ["Earnings", data.earnings],
    ] as const
  )
    .filter(([, block]) => block.freshness.source === "MOCK")
    .map(([label]) => label);

  return (
    <header className="flex flex-col gap-5 border-b border-line-soft pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-ink">
            ES Morning Prep
          </h1>
          <span className="text-ink-3">—</span>
          <span className="text-sm text-ink-2">
            {etLongDate(data.generatedAt)}
          </span>
          {mockSections.length > 0 && (
            <span className="rounded border border-warn/30 bg-warn-dim px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wider text-warn">
              Mock: {mockSections.join(", ")}
            </span>
          )}
        </div>

        <div className="mt-1.5 flex items-center gap-3 text-2xs text-ink-3">
          <span>
            Updated {etTimeWithSeconds(data.generatedAt)} ET
            <span className="text-ink-3/70"> · {ago(data.generatedAt, now)}</span>
          </span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            title="Load the latest published snapshot"
            className="rounded border border-line px-2 py-0.5 text-2xs text-ink-2 transition-colors hover:border-ink-3 hover:text-ink disabled:opacity-40"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="flex items-center gap-6">
          {legs.map((leg) => {
            const dir = directionOf(leg.changePct);
            const up = leg.changePct > 0;
            const flat = dir === "flat";
            return (
              <div key={leg.symbol} className="flex flex-col">
                <span className="eyebrow">{leg.symbol}</span>
                <span
                  className={`readout mt-0.5 text-lg font-semibold ${
                    flat ? "text-ink-2" : up ? "text-pos" : "text-neg"
                  }`}
                >
                  {pct(leg.changePct)}
                  <span className="ml-1.5 text-sm font-normal">
                    {arrowFor(dir)}
                  </span>
                </span>
              </div>
            );
          })}
          {legs.length === 0 && (
            <span className="text-xs text-neg">Futures unavailable</span>
          )}
        </div>

        <div
          className={`flex flex-col items-start rounded-md border px-3 py-2 ${RISK_STYLE[eventRisk]}`}
        >
          <span className="text-2xs font-medium uppercase tracking-[0.14em] opacity-80">
            Event Risk
          </span>
          <span className="text-lg font-semibold leading-tight">{eventRisk}</span>
        </div>
      </div>
    </header>
  );
}
