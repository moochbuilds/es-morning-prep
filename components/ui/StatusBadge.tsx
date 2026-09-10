import type { DataStatus, Freshness } from "@/lib/types";
import { ago, etTime } from "@/lib/format";

const STATUS_STYLE: Record<DataStatus, string> = {
  LIVE: "text-pos",
  DELAYED: "text-warn",
  STALE: "text-warn",
  UNAVAILABLE: "text-neg",
};

/** Small dot + label. Never lets a card imply data is fresher than it is. */
export function StatusBadge({
  freshness,
  now,
}: {
  freshness: Freshness;
  now: number;
}) {
  const { status } = freshness;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-2xs font-medium ${STATUS_STYLE[status]}`}
      title={
        freshness.lastSuccessfulUpdate
          ? `${freshness.source} — last good ${etTime(freshness.lastSuccessfulUpdate)} ET`
          : freshness.source
      }
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status === "LIVE" ? freshness.source : status}
      {status !== "LIVE" && freshness.lastSuccessfulUpdate && (
        <span className="font-normal text-ink-3">
          {ago(freshness.lastSuccessfulUpdate, now)}
        </span>
      )}
    </span>
  );
}

/** Full-card fallback when a provider is down and there is no cached value. */
export function BlockUnavailable({
  label,
  freshness,
}: {
  label: string;
  freshness: Freshness;
}) {
  return (
    <div className="flex h-full min-h-[120px] flex-col items-start justify-center gap-1.5 rounded-md border border-dashed border-line px-4 py-6">
      <p className="text-sm text-ink-2">{label} unavailable</p>
      <p className="text-2xs text-ink-3">
        {freshness.lastSuccessfulUpdate
          ? `Last good reading: ${etTime(freshness.lastSuccessfulUpdate)} ET`
          : "No reading yet this session."}
      </p>
      {freshness.note && (
        <p className="text-2xs text-ink-3/70">{freshness.note}</p>
      )}
    </div>
  );
}
