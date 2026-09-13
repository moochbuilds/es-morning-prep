/**
 * Turns raw calendar rows into interpreted releases using the release library
 * (config/releases.ts): one release per economic print, a category, and the
 * library's higher/lower meaning applied automatically — forecast vs previous
 * before the print, actual vs forecast after it.
 *
 * The surprise is judged against the forecast, not against whether a number
 * is objectively high or low: markets respond to the difference from
 * expectations.
 */

import { EVENT_RISK } from "@/config/thresholds";
import { RELEASES, RELEASE_FAMILIES, type ReleaseDef } from "@/config/releases";
import type { CalendarEvent, Importance, Release, ReleaseFigure, ReleaseReading } from "@/lib/types";

const RANK: Record<Importance, number> = { HIGH: 3, MED: 2, LOW: 1 };

/** Frequency and vintage words that distinguish rows of one release. */
const VARIANT = /\s+\b(mom|yoy|qoq|prel|final|adv|flash)\b/gi;

export const eventKey = (e: CalendarEvent): string => (e.key ?? e.title).toLowerCase().trim();

function matches(def: ReleaseDef, key: string): boolean {
  return def.series.some((s) => s.match.test(key)) || (def.also ? def.also.test(key) : false);
}

/** The library entry for a row: specific releases first, then keyword families. */
export function releaseDef(e: CalendarEvent): ReleaseDef {
  const key = eventKey(e);
  return (
    RELEASES.find((d) => matches(d, key)) ??
    RELEASE_FAMILIES.find((d) => matches(d, key)) ??
    RELEASE_FAMILIES[RELEASE_FAMILIES.length - 1]
  );
}

/** "142K" -> 142000, "0.3%" -> 0.3, "$-78.3B" -> -78.3e9. Null when not numeric. */
export function parseFigure(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const t = raw.replace(/[®$,\s]/g, "").replace(/−/g, "-");
  const m = t.match(/^(-?\d+(?:\.\d+)?)(%|K|M|B|T)?$/i);
  if (!m) return null;
  const scale: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
  return Number(m[1]) * (scale[(m[2] ?? "").toUpperCase()] ?? 1);
}

function figureOf(e: CalendarEvent, label: string | null): ReleaseFigure {
  const consensus = e.consensus || null;
  const model = e.modelForecast || null;
  return {
    label,
    actual: e.actual || null,
    forecast: consensus ?? model,
    forecastSource: consensus ? "consensus" : model ? "model" : null,
    previous: e.previous || null,
  };
}

const hasFigures = (e: CalendarEvent) => Boolean(e.actual || e.consensus || e.modelForecast || e.previous);

function variantLabel(title: string): string {
  const m = title.match(/\b(mom|yoy|qoq)\b/i);
  return m ? ({ mom: "MoM", yoy: "YoY", qoq: "QoQ" } as Record<string, string>)[m[1].toLowerCase()] : "Level";
}

/**
 * The library's higher/lower meaning applied to two readings: `a` compared
 * with `b`, with the release's tolerance deciding what counts as unchanged.
 */
function compare(def: ReleaseDef, a: string | null, b: string | null, vsModel: boolean): ReleaseReading | null {
  const x = parseFigure(a);
  const y = parseFigure(b);
  if (x === null || y === null) return null;
  const diff = x - y;
  const direction = Math.abs(diff) <= (def.tolerance ?? 0) + 1e-9 ? "inline" : diff > 0 ? "above" : "below";
  return {
    direction,
    meaning: direction === "above" ? def.higher ?? null : direction === "below" ? def.lower ?? null : null,
    vsModel,
  };
}

/** After the print: actual vs forecast — what the market reacts to. */
export function surpriseOf(def: ReleaseDef, fig: ReleaseFigure): ReleaseReading | null {
  return compare(def, fig.actual, fig.forecast, fig.forecastSource === "model");
}

/** Before the print: forecast vs previous — the change the market expects. */
export function expectationOf(def: ReleaseDef, fig: ReleaseFigure): ReleaseReading | null {
  return compare(def, fig.forecast, fig.previous, fig.forecastSource === "model");
}

/**
 * Groups rows of the same release at the same time (CPI's MoM, YoY, core and
 * index rows become one CPI release) and drops anything not index-relevant.
 */
export function groupReleases(events: CalendarEvent[]): Release[] {
  const groups = new Map<string, { def: ReleaseDef; rows: CalendarEvent[] }>();
  for (const e of events) {
    const def = releaseDef(e);
    // Generic families group by their own name, so two different housing
    // reports at 10:00 stay separate.
    const family = def.name === null ? e.title.replace(VARIANT, "").trim().toLowerCase() : "";
    const id = `${def.id}|${family}|${e.time}`;
    const group = groups.get(id);
    if (group) group.rows.push(e);
    else groups.set(id, { def, rows: [e] });
  }

  const out: Release[] = [];
  for (const [id, { def, rows }] of groups) {
    const importance =
      def.importance ??
      rows.reduce<Importance>((best, r) => (RANK[r.importance] > RANK[best] ? r.importance : best), "LOW");
    if (EVENT_RISK.hideLowImpact && importance === "LOW") continue;

    let figures: ReleaseFigure[] = def.series.flatMap((s) => {
      const row = rows.find((r) => s.match.test(eventKey(r)));
      return row && hasFigures(row) ? [figureOf(row, s.label)] : [];
    });
    if (figures.length === 0) {
      const withData = rows.filter(hasFigures).slice(0, 2);
      figures = withData.map((r) => figureOf(r, withData.length > 1 ? variantLabel(r.title) : null));
    }

    out.push({
      id,
      time: rows[0].time,
      name: def.name ?? rows[0].title.replace(VARIANT, "").trim(),
      period: rows.find((r) => r.period)?.period ?? null,
      importance,
      category: def.category,
      secondary: def.secondary,
      figures,
      released: figures.some((f) => f.actual !== null),
      surprise: figures[0] ? surpriseOf(def, figures[0]) : null,
      expectation: figures[0] ? expectationOf(def, figures[0]) : null,
      inFocus: false,
    });
  }

  return out.sort(
    (a, b) => Date.parse(a.time) - Date.parse(b.time) || RANK[b.importance] - RANK[a.importance],
  );
}
