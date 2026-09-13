/**
 * Catalysts and scheduled event risk.
 *
 * Event risk describes what COULD move ES on the session being prepared for;
 * it is kept strictly separate from the market backdrop, which describes
 * current financial conditions. A HIGH-impact CPI tomorrow does not make
 * markets risk-off today.
 */

import { EVENT_RISK } from "@/config/thresholds";
import type { Analysis, CalendarEvent, CatalystView, Earnings, Release, RiskLevel } from "@/lib/types";

import { etTime } from "@/lib/format";

import { macroFocus } from "./focus";
import { groupReleases } from "./releases";
import { dayName, etParts, relativeDay, sessionInfo } from "./session";

export const eventDate = (e: { time: string }): string => etParts(Date.parse(e.time)).key;

export function scoreEventRisk(
  items: Array<Pick<Release, "importance" | "time" | "name">>,
  when: string,
): { level: RiskLevel; rationale: string } {
  if (items.length === 0) {
    return { level: "LOW", rationale: `No scheduled US releases ${when}.` };
  }

  let score = items.reduce((s, e) => s + EVENT_RISK.points[e.importance], 0);
  const highs = items.filter((e) => e.importance === "HIGH");
  if (highs.length >= 2) score += EVENT_RISK.multipleHighBonus;

  const window = EVENT_RISK.clusterWindowMinutes * 60_000;
  for (let i = 0; i < highs.length - 1; i++) {
    const gap = Math.abs(Date.parse(highs[i + 1].time) - Date.parse(highs[i].time));
    if (gap <= window) score += EVENT_RISK.clusterBonus;
  }

  const level: RiskLevel =
    score >= EVENT_RISK.thresholds.high ? "HIGH" : score >= EVENT_RISK.thresholds.medium ? "MEDIUM" : "LOW";

  const rationale =
    highs.length >= 2
      ? `${highs.length} high-impact events ${when}, including ${highs[0].name}.`
      : highs.length === 1
        ? `${highs[0].name} is the dominant catalyst ${when}.`
        : `Second-tier releases only ${when}.`;

  return { level, rationale };
}

/**
 * The one line the eye should land on. In order of importance: a high-impact
 * release that has printed away from forecast; the session's next
 * high-impact release; a high-impact release that printed in line; or, on a
 * quiet session, the next major catalyst.
 */
function keyTakeaway(
  releases: Release[],
  nextMajor: Release | null,
  now: number,
  sessionDate: string,
  today: string,
): CatalystView["headline"] {
  const highs = releases.filter((r) => r.importance === "HIGH");
  const upcoming = highs.filter((r) => Date.parse(r.time) > now);
  const printed = highs.filter((r) => r.released && r.surprise);
  const byPriority = (list: Release[]) =>
    [...list].sort((a, b) => Number(b.inFocus) - Number(a.inFocus) || Date.parse(b.time) - Date.parse(a.time))[0];
  const nextUp = upcoming[0]
    ? ` · Next: ${upcoming[0].name} ${etTime(upcoming[0].time)} ET`
    : "";

  const surprising = printed.filter((r) => r.surprise!.direction !== "inline");
  if (surprising.length > 0) {
    const r = byPriority(surprising);
    const s = r.surprise!;
    const f = r.figures[0];
    return {
      text: `${r.name} ${s.direction} forecast${s.meaning ? ` → ${s.meaning}` : ""}`,
      detail: `Actual ${f.actual} vs forecast ${f.forecast}${s.vsModel ? " (TE est.)" : ""}${nextUp}`,
    };
  }

  if (upcoming.length > 0) {
    const r = upcoming[0];
    const f = r.figures[0];
    const more = upcoming.length > 1 ? ` + ${upcoming.length - 1} more high-impact` : "";
    return {
      text: `${r.name} at ${etTime(r.time)} ET${more}`,
      detail: f
        ? `Forecast ${f.forecast ?? "—"}${f.forecastSource === "model" ? " (TE est.)" : ""} · Previous ${f.previous ?? "—"}`
        : "Judged on tone, not a number.",
    };
  }

  if (printed.length > 0) {
    const r = byPriority(printed);
    const f = r.figures[0];
    return { text: `${r.name} in line with forecast`, detail: `Actual ${f.actual} vs forecast ${f.forecast}` };
  }

  const day = sessionDate === today ? "today" : `on ${dayName(sessionDate)}`;
  return {
    text: `No major U.S. data ${day}`,
    detail: nextMajor
      ? `Next major: ${nextMajor.name} · ${relativeDay(eventDate(nextMajor), today)} ${etTime(nextMajor.time)} ET`
      : null,
  };
}

export function buildCatalystView(
  calendar: CalendarEvent[] | null,
  earnings: Earnings | null,
  now: number,
  analysis: Analysis | null = null,
): CatalystView {
  const session = sessionInfo(now);
  const sessionDate = session.nextSession;
  const sessionIsToday = sessionDate === session.today;

  const all = groupReleases(calendar ?? []);
  const horizon = now + EVENT_RISK.lookaheadDays * 86_400_000;
  const upcomingMajor = all.filter(
    (r) => r.importance === "HIGH" && Date.parse(r.time) > now && Date.parse(r.time) <= horizon,
  );

  const focus = macroFocus(analysis, upcomingMajor.filter((r) => r.category !== null), session.today);
  const mark = (r: Release): Release => ({
    ...r,
    inFocus: r.category !== null && focus.categories.includes(r.category),
  });

  const inSession = all.filter((r) => eventDate(r) === sessionDate).map(mark);
  const minutesTo = (r: Release) => Math.round((Date.parse(r.time) - now) / 60_000);
  const next = inSession.find((r) => Date.parse(r.time) > now) ?? null;
  const major = upcomingMajor[0] ? mark(upcomingMajor[0]) : null;
  const when = sessionIsToday ? "today" : `on ${dayName(sessionDate)}`;
  const releases = inSession.filter((r) => r.category !== null);

  return {
    session,
    sessionDate,
    sessionIsToday,
    releases,
    headline: keyTakeaway(releases, major, now, sessionDate, session.today),
    other: inSession.filter((r) => r.category === null),
    later: upcomingMajor
      .filter((r) => r.category !== null && eventDate(r) > sessionDate)
      .slice(0, EVENT_RISK.laterShown)
      .map(mark),
    nextEvent: next ? { release: next, minutesAway: minutesTo(next) } : null,
    nextMajor: major ? { release: major, minutesAway: minutesTo(major) } : null,
    eventRisk:
      calendar === null
        ? { level: "LOW", rationale: "Economic calendar unavailable — event risk cannot be assessed." }
        : scoreEventRisk(inSession, when),
    focus,
    earnings: earnings
      ? {
          // Reports fetched for a different session are not this session's catalysts.
          upcoming: earnings.forDate === sessionDate ? earnings.upcoming : [],
          reported: earnings.reported,
          forDate: earnings.forDate,
        }
      : null,
  };
}
