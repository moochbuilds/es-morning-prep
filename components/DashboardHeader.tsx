"use client";

import type { CatalystView, DashboardData } from "@/lib/types";
import { ago, etLongDate, etTimeWithSeconds, pct } from "@/lib/format";
import { dayShort, quoteLabel, sessionLabel } from "@/lib/engine/session";

import { Info } from "./ui/Popover";
import { RISK_TONE, TONE_CHIP, moveClass } from "./ui/tone";

const BLOCK_NAMES: Array<[keyof DashboardData, string]> = [
  ["futures", "Futures"],
  ["breadth", "Breadth"],
  ["sectors", "Sectors"],
  ["rates", "Rates"],
  ["credit", "Credit"],
  ["creditProxy", "HYG/LQD"],
  ["volatility", "Volatility"],
  ["vixFutures", "VX futures"],
  ["calendar", "Calendar"],
  ["earnings", "Earnings"],
];

export function DashboardHeader({
  data,
  catalysts,
  now,
  onRefresh,
  refreshing,
}: {
  data: DashboardData;
  catalysts: CatalystView;
  now: number;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const session = catalysts.session;
  const futures = data.futures.data;
  const legs = futures ? [futures.es, futures.nq, futures.rty] : [];
  const futuresLabel = futures ? quoteLabel(futures.quoteTime, session, "futures") : null;
  const risk = catalysts.eventRisk.level;

  // Named per section, so a partly simulated page can't pass for a live one.
  const mock = BLOCK_NAMES.filter(([key]) => {
    const b = data[key] as { freshness?: { source: string } };
    return b?.freshness?.source === "MOCK";
  }).map(([, name]) => name);

  const sessionLine =
    session.phase === "RTH"
      ? "Session in progress"
      : `Next session: ${catalysts.sessionIsToday ? "today" : sessionLabel(session.nextSession)}`;

  return (
    <header className="flex flex-col gap-5 border-b border-line-soft pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-ink">ES Morning Prep</h1>
          <span className="text-ink-3">—</span>
          <span className="text-sm text-ink-2">{etLongDate(now)}</span>
          {mock.length > 0 && (
            <span className="rounded border border-warn/30 bg-warn-dim px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wider text-warn">
              Mock: {mock.length === BLOCK_NAMES.length ? "all sections" : mock.join(", ")}
            </span>
          )}
        </div>

        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs">
          <span className={session.cashOpen ? "text-pos" : "text-ink-2"}>{session.label}</span>
          <span className="text-ink-3">·</span>
          <span className="text-ink-2">{sessionLine}</span>
        </p>

        <div className="mt-1.5 flex items-center gap-3 text-2xs text-ink-3">
          <span>
            Snapshot {etTimeWithSeconds(data.generatedAt)} ET
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

      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div>
          {futuresLabel && !futuresLabel.live && (
            <span className="mb-1 block text-2xs font-medium uppercase tracking-[0.14em] text-warn/80">
              {futuresLabel.label}
            </span>
          )}
          <div className="flex items-center gap-6">
            {legs.map((leg) => (
              <div key={leg.symbol} className="flex flex-col">
                <span className="eyebrow">{leg.symbol}</span>
                <span className={`readout mt-0.5 text-lg font-semibold ${moveClass(leg.changePct)}`}>
                  {pct(leg.changePct)}
                </span>
              </div>
            ))}
            {legs.length === 0 && <span className="text-xs text-neg">Futures unavailable</span>}
          </div>
        </div>

        <div className={`flex flex-col items-start rounded-md border px-3 py-2 ${TONE_CHIP[RISK_TONE[risk]]}`}>
          <span className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-[0.14em] opacity-80">
            Scheduled Event Risk · {catalysts.sessionIsToday ? "Today" : dayShort(catalysts.sessionDate)}
            <Info term="eventRisk" align="right" />
          </span>
          <span className="text-lg font-semibold leading-tight">{risk}</span>
        </div>
      </div>
    </header>
  );
}
