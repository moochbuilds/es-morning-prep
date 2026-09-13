"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { FRESHNESS, REFRESH } from "@/config/thresholds";
import { buildCatalystView } from "@/lib/engine/catalysts";
import { ago } from "@/lib/format";
import { ageBlock } from "@/lib/freshness";
import { SCHEMA_VERSION, type DashboardData, type Interpretation } from "@/lib/types";

import { CatalystCard } from "./CatalystCard";
import { CreditCard } from "./CreditCard";
import { DashboardHeader } from "./DashboardHeader";
import { DivergenceStrip } from "./DivergenceStrip";
import { EquityConfirmationCard } from "./EquityConfirmationCard";
import { RatesCard } from "./RatesCard";
import { TodayRead } from "./TodayRead";
import { VitalSignsCard } from "./VitalSignsCard";
import { VolatilityCard } from "./VolatilityCard";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const CLOCK_TICK_MS = 15_000;

class NewerVersionError extends Error {}

/**
 * Cache-busted: GitHub Pages serves files with max-age=600, which would
 * otherwise pin a ten-minute-old snapshot in the browser.
 */
async function fetchSnapshot<T>(file: string): Promise<T> {
  const res = await fetch(`${BASE_PATH}/data/${file}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Snapshots are written once and read for minutes afterwards, so anything
 * time-relative (pipeline freshness, session state, next catalyst) is
 * recomputed against the viewer's clock rather than trusted from generation
 * time. The engine's analysis itself is time-independent.
 */
function project(d: DashboardData, now: number): DashboardData {
  return {
    ...d,
    futures: ageBlock(d.futures, now),
    breadth: ageBlock(d.breadth, now),
    sectors: ageBlock(d.sectors, now),
    rates: ageBlock(d.rates, now),
    credit: ageBlock(d.credit, now),
    creditProxy: ageBlock(d.creditProxy, now),
    volatility: ageBlock(d.volatility, now),
    vixFutures: ageBlock(d.vixFutures, now),
    calendar: ageBlock(d.calendar, now),
    earnings: ageBlock(d.earnings, now),
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
  const [now, setNow] = useState(() => (initialData ? Date.parse(initialData.generatedAt) : 0));

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [nextData, nextRead] = await Promise.all([
        fetchSnapshot<DashboardData>("dashboard.json"),
        fetchSnapshot<Interpretation>("interpretation.json").catch(() => null),
      ]);
      if (nextData.schemaVersion !== SCHEMA_VERSION) throw new NewerVersionError();
      setData(nextData);
      setInterpretation(nextRead);
      setError(null);
    } catch (err) {
      console.error("Snapshot fetch failed:", err);
      setError(
        err instanceof NewerVersionError
          ? "A newer version of the dashboard has been published — reload the page to see it."
          : "Couldn't load the latest snapshot — showing the last one received.",
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
    if (!initialData) void load();
    return () => {
      clearInterval(clock);
      clearInterval(poll);
    };
  }, [initialData, load]);

  const view = useMemo(() => (data ? project(data, now || Date.parse(data.generatedAt)) : null), [data, now]);

  if (!view) return <WaitingForSnapshot error={error} />;

  const clock = now || Date.parse(view.generatedAt);
  const snapshotAge = clock - Date.parse(view.generatedAt);
  const analysis = view.analysis;
  const catalysts = buildCatalystView(view.calendar.data, view.earnings.data, clock, analysis);

  // An AI narrative is only shown for the snapshot it was written about.
  const narrative =
    interpretation && interpretation.signature === analysis.signature
      ? interpretation
      : { text: analysis.narrative, generatedBy: "rule" as const, generatedAt: view.generatedAt };

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-5 lg:px-8 lg:py-8">
      <DashboardHeader
        data={view}
        catalysts={catalysts}
        now={clock}
        onRefresh={() => void load()}
        refreshing={refreshing}
      />

      {snapshotAge >= FRESHNESS.staleAfterMs && (
        <p className="mt-4 rounded-md border border-warn/30 bg-warn-dim px-3 py-2 text-xs text-warn">
          Last refreshed {ago(view.generatedAt, clock)}. The scheduled refresh may be delayed or paused, so
          every section below is out of date.
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-md border border-warn/30 bg-warn-dim px-3 py-2 text-xs text-warn">{error}</p>
      )}

      {/* Row 2 — the synthesized read and the three vital signs at a glance */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex lg:col-span-8">
          <TodayRead analysis={analysis} narrative={narrative} catalysts={catalysts} />
        </div>
        <div className="flex lg:col-span-4">
          <VitalSignsCard analysis={analysis} data={view} now={clock} />
        </div>
      </div>

      {/* Directly beneath Today's Read: disagreements are the information */}
      <div className="mt-4">
        <DivergenceStrip divergences={analysis.synthesis.divergences} />
      </div>

      {/* Row 3 — the vital signs in detail */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="flex">
          <RatesCard block={view.rates} rates={analysis.rates} now={clock} />
        </div>
        <div className="flex">
          <CreditCard
            block={view.credit}
            proxyBlock={view.creditProxy}
            credit={analysis.credit}
            proxy={analysis.creditProxy}
            session={catalysts.session}
            now={clock}
          />
        </div>
        <div className="flex md:col-span-2 xl:col-span-1">
          <VolatilityCard block={view.volatility} vol={analysis.volatility} session={catalysts.session} now={clock} />
        </div>
      </div>

      {/* Row 4 — is equity positioning consistent with the vital signs? */}
      <div className="mt-4 flex">
        <EquityConfirmationCard data={view} equities={analysis.equities} session={catalysts.session} now={clock} />
      </div>

      {/* Row 5 — what could move ES, kept apart from current conditions */}
      <div className="mt-4 flex">
        <CatalystCard calendar={view.calendar} earningsBlock={view.earnings} view={catalysts} now={clock} />
      </div>

      <footer className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line-soft pt-4 text-2xs text-ink-3">
        <span>All times Eastern.</span>
        <span>Data refreshes about every 5 minutes on weekdays.</span>
        <span>
          Classifications are deterministic heuristics judged against each series&apos; own history — context,
          not trade signals.
        </span>
        <span>Yahoo data is unofficial and delayed; check each section&apos;s source badge.</span>
        {view.mode === "mock" && <span className="text-warn/80">DATA_MODE=mock — every figure is simulated.</span>}
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
        {error ?? "The scheduled refresh publishes one within a few minutes. This page checks automatically."}
      </p>
    </main>
  );
}
