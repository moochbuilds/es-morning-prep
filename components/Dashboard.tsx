"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { FRESHNESS, REFRESH } from "@/config/thresholds";
import { ago } from "@/lib/format";
import { ageBlock } from "@/lib/freshness";
import { scoreEventRisk } from "@/lib/scoring";
import type { DashboardData, Interpretation } from "@/lib/types";

import { BreadthCard } from "./BreadthCard";
import { CatalystCard } from "./CatalystCard";
import { DashboardHeader } from "./DashboardHeader";
import { EarningsCard } from "./EarningsCard";
import { IndexConfirmationCard } from "./IndexConfirmationCard";
import { MarketStressCard } from "./MarketStressCard";
import { SectorRotationCard } from "./SectorRotationCard";
import { TodayRead } from "./TodayRead";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const CLOCK_TICK_MS = 15_000;

/**
 * Cache-busted: GitHub Pages serves files with max-age=600, which would
 * otherwise pin a ten-minute-old snapshot in the browser.
 */
async function fetchSnapshot<T>(file: string): Promise<T> {
  const res = await fetch(`${BASE_PATH}/data/${file}?t=${Date.now()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/**
 * A snapshot is written once and then read for minutes afterwards, so anything
 * time-relative (freshness status, next-event countdown) is recomputed against
 * the viewer's clock rather than trusted from generation time.
 */
function project(data: DashboardData, now: number): DashboardData {
  return {
    ...data,
    futures: ageBlock(data.futures, now),
    breadth: ageBlock(data.breadth, now),
    sectors: ageBlock(data.sectors, now),
    rates: ageBlock(data.rates, now),
    volatility: ageBlock(data.volatility, now),
    credit: ageBlock(data.credit, now),
    calendar: ageBlock(data.calendar, now),
    earnings: ageBlock(data.earnings, now),
    derived: {
      ...data.derived,
      eventRisk: scoreEventRisk(data.calendar.data, now),
    },
  };
}

export function Dashboard({
  initialData,
  initialInterpretation,
}: {
  initialData: DashboardData | null;
  initialInterpretation: Interpretation | null;
}) {
  const [data, setData] = useState(initialData);
  const [interpretation, setInterpretation] = useState(initialInterpretation);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Starts at the snapshot's own timestamp so the prerendered HTML and the
  // first client render agree; switches to the real clock after mount.
  const [now, setNow] = useState(() =>
    initialData ? Date.parse(initialData.generatedAt) : 0,
  );

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [nextData, nextInterpretation] = await Promise.all([
        fetchSnapshot<DashboardData>("dashboard.json"),
        fetchSnapshot<Interpretation>("interpretation.json").catch(() => null),
      ]);
      setData(nextData);
      if (nextInterpretation) setInterpretation(nextInterpretation);
      setError(null);
    } catch (err) {
      console.error("Snapshot fetch failed:", err);
      setError(
        "Couldn't load the latest snapshot — showing the last one received.",
      );
    } finally {
      setRefreshing(false);
      setNow(Date.now());
    }
  }, []);

  useEffect(() => {
    setNow(Date.now());
    const clock = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    const poll = setInterval(() => void load(), REFRESH.dashboard);
    // Prerendered before any snapshot existed: fetch one straight away.
    if (!initialData) void load();
    return () => {
      clearInterval(clock);
      clearInterval(poll);
    };
  }, [initialData, load]);

  const refresh = useCallback(() => void load(), [load]);

  const view = useMemo(
    () => (data ? project(data, now || Date.parse(data.generatedAt)) : null),
    [data, now],
  );

  if (!view) return <WaitingForSnapshot error={error} />;

  const clock = now || Date.parse(view.generatedAt);
  const snapshotAge = clock - Date.parse(view.generatedAt);

  return (
    <main className="mx-auto w-full max-w-[1600px] px-5 py-6 lg:px-8 lg:py-8">
      <DashboardHeader
        data={view}
        now={clock}
        onRefresh={refresh}
        refreshing={refreshing}
      />

      {snapshotAge >= FRESHNESS.staleAfterMs && (
        <p className="mt-4 rounded-md border border-warn/30 bg-warn-dim px-3 py-2 text-xs text-warn">
          Last refreshed {ago(view.generatedAt, clock)}. The scheduled refresh
          may be delayed or paused, so every card below is out of date.
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-md border border-warn/30 bg-warn-dim px-3 py-2 text-xs text-warn">
          {error}
        </p>
      )}

      {/* One grid for all seven sections. Base `order-*` gives the mobile
          reading order; `lg:order-none` restores source order for desktop. */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-6 lg:grid-cols-12">
        <GridCell className="order-2 md:col-span-3 lg:order-none lg:col-span-3">
          <CatalystCard
            block={view.calendar}
            eventRisk={view.derived.eventRisk}
            now={clock}
          />
        </GridCell>

        <GridCell className="order-1 md:col-span-6 lg:order-none lg:col-span-6">
          <TodayRead data={view} read={interpretation?.read ?? null} now={clock} />
        </GridCell>

        <GridCell className="order-5 md:col-span-3 lg:order-none lg:col-span-3">
          <MarketStressCard data={view} now={clock} />
        </GridCell>

        <GridCell className="order-4 md:col-span-3 lg:order-none lg:col-span-4">
          <BreadthCard
            block={view.breadth}
            score={view.derived.breadth}
            now={clock}
          />
        </GridCell>

        <GridCell className="order-6 md:col-span-3 lg:order-none lg:col-span-4">
          <SectorRotationCard
            block={view.sectors}
            score={view.derived.rotation}
            now={clock}
          />
        </GridCell>

        <GridCell className="order-3 md:col-span-3 lg:order-none lg:col-span-4">
          <IndexConfirmationCard
            block={view.futures}
            score={view.derived.confirmation}
            now={clock}
          />
        </GridCell>

        <GridCell className="order-7 md:col-span-6 lg:order-none lg:col-span-12">
          <EarningsCard
            block={view.earnings}
            takeaways={interpretation?.takeaways ?? {}}
            aiPending={interpretation === null}
            aiConfigured={interpretation?.aiConfigured ?? false}
            now={clock}
          />
        </GridCell>
      </div>

      <footer className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line-soft pt-4 text-2xs text-ink-3">
        <span>All times Eastern.</span>
        <span>Data refreshes about every 5 minutes on weekdays.</span>
        <span>
          Scores are decision-support heuristics, not precise measurements.
        </span>
        <span>
          Yahoo Finance data is unofficial and delayed; check each card&apos;s
          source badge.
        </span>
        {view.mode === "mock" && (
          <span className="text-warn/80">
            DATA_MODE=mock — every figure is simulated.
          </span>
        )}
      </footer>
    </main>
  );
}

function WaitingForSnapshot({ error }: { error: string | null }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-2 px-5 text-center">
      <h1 className="text-lg font-semibold text-ink">ES Morning Prep</h1>
      <p className="text-sm text-ink-2">No data snapshot published yet.</p>
      <p className="text-xs text-ink-3">
        {error ??
          "The scheduled refresh publishes one within a few minutes. This page checks automatically."}
      </p>
    </main>
  );
}

/** Grid cell. Keeps ordering and span classes out of the card components. */
function GridCell({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return <div className={`flex ${className}`}>{children}</div>;
}
