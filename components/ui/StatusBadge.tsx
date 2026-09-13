import type { DataStatus, Freshness } from "@/lib/types";
import { ago, etTime } from "@/lib/format";

const STATUS_STYLE: Record<Exclude<DataStatus, "LIVE">, string> = {
  DELAYED: "text-warn",
  STALE: "text-warn",
  UNAVAILABLE: "text-neg",
};

/**
 * Source plus what the data actually represents: "Yahoo · Live",
 * "Yahoo · Fri close", "FRED · As of Sep 10". Weekend and daily data never
 * pass for live. Pipeline problems (DELAYED/STALE/UNAVAILABLE) override it.
 */
export function FreshnessBadge({
  freshness,
  now,
  label,
  live,
  source,
}: {
  freshness: Freshness;
  now: number;
  label: string;
  live: boolean;
  /** Overrides the provider name, for sections built from several sources. */
  source?: string;
}) {
  const { status } = freshness;
  const name = source ?? freshness.source;
  const title = freshness.lastSuccessfulUpdate
    ? `${name} — fetched ${etTime(freshness.lastSuccessfulUpdate)} ET`
    : name;

  if (status === "LIVE") {
    return (
      <span className="inline-flex items-center gap-1.5 text-2xs text-ink-3" title={title}>
        <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-pos" : "bg-ink-3"}`} />
        {name} · {label}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 text-2xs font-medium ${STATUS_STYLE[status]}`} title={title}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
      <span className="font-normal text-ink-3">
        {label}
        {freshness.lastSuccessfulUpdate && ` · fetched ${ago(freshness.lastSuccessfulUpdate, now)}`}
      </span>
    </span>
  );
}

/** Full-section fallback when a provider is down and there is no cached value. */
export function BlockUnavailable({ label, freshness }: { label: string; freshness: Freshness }) {
  return (
    <div className="flex h-full min-h-[120px] flex-col items-start justify-center gap-1.5 rounded-md border border-dashed border-line px-4 py-6">
      <p className="text-sm text-ink-2">{label} unavailable</p>
      <p className="text-2xs text-ink-3">
        {freshness.lastSuccessfulUpdate
          ? `Last good reading: ${etTime(freshness.lastSuccessfulUpdate)} ET`
          : "No reading yet."}
      </p>
      {freshness.note && <p className="text-2xs text-ink-3/70">{freshness.note}</p>}
    </div>
  );
}

const RANK: Record<DataStatus, number> = { LIVE: 0, DELAYED: 1, STALE: 2, UNAVAILABLE: 3 };

/** The least fresh of several blocks — a composite never looks fresher than its inputs. */
export function worstFreshness(list: Freshness[]): Freshness {
  return [...list].sort((a, b) => RANK[b.status] - RANK[a.status])[0];
}
