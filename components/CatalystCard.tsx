"use client";

import { CATEGORY_WHY } from "@/config/releases";
import type {
  Block,
  CalendarEvent,
  CatalystView,
  Earnings,
  Release,
  ReleaseFigure,
  ReleaseReading,
} from "@/lib/types";
import { etTime, pct } from "@/lib/format";
import { eventDate } from "@/lib/engine/catalysts";
import { dayShort, sessionLabel } from "@/lib/engine/session";

import { Card } from "./ui/Card";
import { Info, Popover, Why } from "./ui/Popover";
import { FreshnessBadge } from "./ui/StatusBadge";
import { RISK_TONE, TONE_CHIP } from "./ui/tone";

/**
 * Visual hierarchy, top to bottom: one key takeaway; the session's
 * high-impact releases as bold single rows with the number that matters
 * biggest; second-tier and later releases as muted one-liners. Everything
 * explanatory (category, secondary figures, why it matters) lives on hover.
 */

const ARROW = { above: "▲", below: "▼", inline: "=" } as const;

function marketCap(usd: number): string {
  if (usd >= 1e12) return `$${(usd / 1e12).toFixed(1)}T`;
  return `$${Math.round(usd / 1e9)}B`;
}

const est = (f: ReleaseFigure) => (f.forecastSource === "model" ? " (TE est.)" : "");

/** "▲ Above forecast → stronger inflation pressure" — the rule applied to the data. */
function readingText(r: ReleaseReading, kind: "surprise" | "expectation"): string {
  if (kind === "surprise") {
    return r.direction === "inline"
      ? "= In line with forecast"
      : `${ARROW[r.direction]} ${r.direction === "above" ? "Above" : "Below"} forecast${r.meaning ? ` → ${r.meaning}` : ""}`;
  }
  return r.direction === "inline"
    ? "Exp. vs prior: unchanged"
    : `Exp. vs prior: ${ARROW[r.direction]} ${r.meaning ?? (r.direction === "above" ? "higher" : "lower")}`;
}

/** Name with every supporting detail on hover: category, why it matters, all figures. */
function ReleaseName({ release: r, className }: { release: Release; className: string }) {
  return (
    <Popover
      wide
      triggerClassName={`cursor-help underline decoration-ink-3/50 decoration-dotted decoration-1 underline-offset-4 ${className}`}
      trigger={r.name}
    >
      <span className="block font-medium text-ink">
        {r.name}
        {r.period && <span className="ml-1.5 uppercase text-ink-3">{r.period}</span>}
      </span>
      {r.category ? (
        <>
          <span className="mt-1 block text-[10px] font-medium tracking-[0.12em] text-ink-2">
            {r.category}
            {r.secondary && ` · ${r.secondary.toUpperCase()}`}
          </span>
          <span className="mt-1 block">{CATEGORY_WHY[r.category]}</span>
        </>
      ) : (
        <span className="mt-1 block">{r.secondary ?? "Scheduled event"} — not economic data.</span>
      )}
      {r.figures.length > 0 && (
        <span className="mt-2 block space-y-0.5">
          {r.figures.map((f, i) => (
            <span key={i} className="block">
              <span className="text-ink-3">{f.label ?? "Figure"}: </span>
              {f.actual && <>Actual {f.actual} · </>}
              Forecast {f.forecast ?? "—"}
              {est(f)} · Previous {f.previous ?? "—"}
            </span>
          ))}
        </span>
      )}
      {r.inFocus && <span className="mt-2 block text-ink-3">In focus: its category is the current macro focus.</span>}
    </Popover>
  );
}

/** A high-impact release: the one row style that should draw the eye. */
function MajorRow({ release: r, now }: { release: Release; now: number }) {
  const f = r.figures[0];
  const past = Date.parse(r.time) <= now;
  return (
    <li className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1 border-b border-line-soft py-3 last:border-b-0 sm:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1.1fr)]">
      <span className="readout pt-0.5 text-sm text-ink-2">{etTime(r.time)}</span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <ReleaseName release={r} className="text-[15px] font-semibold text-ink" />
          {r.period && <span className="text-2xs uppercase text-ink-3">{r.period}</span>}
          {r.inFocus && (
            <span className="flex items-center gap-1 text-2xs text-ink-2">
              <span className="h-1.5 w-1.5 rounded-full bg-ink-2" />
              In focus
            </span>
          )}
        </p>
      </div>
      <div className="col-start-2 sm:col-start-auto sm:text-right">
        {!f ? (
          <p className="text-xs text-ink-3">{r.category === "FED" ? "Judged on tone, not a number" : "Forecast not yet published"}</p>
        ) : r.released ? (
          <>
            <p className="flex flex-wrap items-baseline gap-x-2 sm:justify-end">
              <span className="readout text-lg font-semibold text-ink">{f.actual}</span>
              <span className="readout text-2xs text-ink-3">
                vs F {f.forecast ?? "—"}
                {est(f)} · P {f.previous ?? "—"}
              </span>
            </p>
            {r.surprise && <p className="mt-0.5 text-xs font-medium text-ink">{readingText(r.surprise, "surprise")}</p>}
          </>
        ) : (
          <>
            <p className="readout flex flex-wrap items-baseline gap-x-2 sm:justify-end">
              <span className="text-2xs text-ink-3">F</span>
              <span className="text-lg font-semibold text-ink">{f.forecast ?? "—"}</span>
              {f.forecastSource === "model" && <span className="text-2xs text-ink-3">TE est.</span>}
              <span className="ml-1 text-2xs text-ink-3">P</span>
              <span className="text-sm text-ink-2">{f.previous ?? "—"}</span>
            </p>
            {r.expectation && <p className="mt-0.5 text-2xs text-ink-3">{readingText(r.expectation, "expectation")}</p>}
            {past && <p className="mt-0.5 text-2xs text-ink-3">Awaiting actual</p>}
          </>
        )}
      </div>
    </li>
  );
}

/** Second-tier and later releases: one muted line each. */
function MinorRow({ release: r, showDay }: { release: Release; showDay: boolean }) {
  const f = r.figures[0];
  return (
    <li className="flex items-baseline gap-3 py-1 text-xs">
      <span className="readout w-[6.5rem] shrink-0 text-ink-3">
        {showDay && `${dayShort(eventDate(r))} `}
        {etTime(r.time)}
      </span>
      <span className="min-w-0 flex-1 truncate">
        <ReleaseName release={r} className={r.importance === "HIGH" ? "text-ink-2" : "text-ink-3"} />
        {r.inFocus && <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-ink-2 align-middle" title="In focus" />}
      </span>
      <span className="readout shrink-0 text-2xs text-ink-3">
        {!f
          ? r.category === null
            ? "Treasury supply"
            : ""
          : f.actual
            ? `${f.actual} vs F ${f.forecast ?? "—"}${r.surprise && r.surprise.direction !== "inline" ? ` ${ARROW[r.surprise.direction]}` : ""}`
            : `F ${f.forecast ?? "—"} · P ${f.previous ?? "—"}`}
      </span>
    </li>
  );
}

export function CatalystCard({
  calendar,
  earningsBlock,
  view,
  now,
}: {
  calendar: Block<CalendarEvent[]>;
  earningsBlock: Block<Earnings>;
  view: CatalystView;
  now: number;
}) {
  const dayTitle = view.sessionIsToday ? "Today" : sessionLabel(view.sessionDate);
  const riskDay = view.sessionIsToday ? "Today" : dayShort(view.sessionDate);
  const majors = view.releases.filter((r) => r.importance === "HIGH");
  const minors = [...view.releases.filter((r) => r.importance !== "HIGH"), ...view.other].sort(
    (a, b) => Date.parse(a.time) - Date.parse(b.time),
  );
  const earnings = view.earnings;
  const hasEarnings = earnings && (earnings.upcoming.length > 0 || earnings.reported.length > 0);
  const focusEvidence = { ...view.focus.evidence, lines: [view.focus.detail, ...view.focus.evidence.lines] };

  return (
    <Card
      title="Catalysts · Economic Releases"
      info="surprise"
      badge={<FreshnessBadge freshness={calendar.freshness} now={now} label="scheduled events" live={false} />}
    >
      {/* 1 — the takeaway the eye lands on */}
      <div className="rounded-md border border-line bg-base/40 px-4 py-3.5">
        <span className="eyebrow">Key takeaway · {dayTitle}</span>
        {calendar.data === null ? (
          <p className="mt-1 text-lg font-semibold text-neg">Economic calendar unavailable</p>
        ) : (
          <>
            <p className="mt-1 text-xl font-semibold tracking-tight text-ink">{view.headline.text}</p>
            {view.headline.detail && <p className="readout mt-0.5 text-xs text-ink-2">{view.headline.detail}</p>}
          </>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-2xs">
          <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 ${TONE_CHIP[RISK_TONE[view.eventRisk.level]]}`}>
            <span className="uppercase tracking-[0.12em] opacity-80">Scheduled event risk · {riskDay}</span>
            <span className="font-semibold">{view.eventRisk.level}</span>
            <Info term="eventRisk" />
          </span>
          <span className="inline-flex items-center gap-1.5 rounded border border-line px-2 py-1 text-ink-2">
            <span className="uppercase tracking-[0.12em] text-ink-3">Macro focus</span>
            <span className="font-semibold text-ink">
              <Why evidence={focusEvidence}>{view.focus.label}</Why>
            </span>
          </span>
        </div>
      </div>

      {/* 2 — the session's high-impact releases */}
      {majors.length > 0 && (
        <section className="mt-4">
          <h3 className="eyebrow">High impact · {dayTitle}</h3>
          <ul className="mt-1">
            {majors.map((r) => (
              <MajorRow key={r.id} release={r} now={now} />
            ))}
          </ul>
        </section>
      )}

      {/* 3 — everything else, muted */}
      <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-2">
        {minors.length > 0 && (
          <section>
            <h3 className="eyebrow">Second tier · {dayTitle}</h3>
            <ul className="mt-1">
              {minors.map((r) => (
                <MinorRow key={r.id} release={r} showDay={false} />
              ))}
            </ul>
          </section>
        )}
        {view.later.length > 0 && (
          <section>
            <h3 className="eyebrow">Later · high impact</h3>
            <ul className="mt-1">
              {view.later.map((r) => (
                <MinorRow key={r.id} release={r} showDay />
              ))}
            </ul>
          </section>
        )}
      </div>

      <p className="divider mt-4 pt-3 text-xs text-ink-3">
        <span className="eyebrow mr-2">Earnings</span>
        {earningsBlock.data === null
          ? "Earnings calendar unavailable."
          : !hasEarnings
            ? "No major index-moving earnings."
            : [
                ...earnings!.upcoming.map(
                  (e) =>
                    `${e.ticker} ${e.slot === "PRE-MARKET" ? "pre-market" : "after close"}${e.marketCapUsd !== null ? ` (${marketCap(e.marketCapUsd)})` : ""}`,
                ),
                ...earnings!.reported.map(
                  (r) =>
                    `${r.ticker} reported${r.epsSurprisePct !== null ? ` · EPS ${pct(r.epsSurprisePct, 1)} vs est` : ""}${r.stockReactionPct !== null ? ` · shares ${pct(r.stockReactionPct, 1)}` : ""}`,
                ),
              ].join("  ·  ")}
      </p>
    </Card>
  );
}
