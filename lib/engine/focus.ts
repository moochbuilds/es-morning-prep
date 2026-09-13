/**
 * Current Macro Focus: what the market currently appears most sensitive to.
 *
 * Inferred from what is being repriced — mainly the front end of the curve,
 * the long end and its driver, and credit — never from the calendar alone.
 * It explains why some releases matter more than others on a given day: the
 * releases in the focus categories are marked "in focus".
 */

import { RATES } from "@/config/thresholds";
import { bp } from "@/lib/format";
import type { Analysis, MacroFocus, Release, ReleaseCategory } from "@/lib/types";

import { sentenceCase } from "./labels";
import { relativeDay, etParts } from "./session";
import { clears } from "./stats";

const PRIORITY: ReleaseCategory[] = ["FED", "INFLATION", "LABOR", "GROWTH", "SENTIMENT"];

export function macroFocus(
  a: Analysis | null,
  upcomingMajor: Release[],
  today: string,
): MacroFocus {
  const r = a?.rates ?? null;
  const c = a?.credit ?? null;

  const lines: string[] = [];
  if (r) {
    lines.push(`2Y ${bp(r.y2.d5.value)} and 10Y ${bp(r.y10.d5.value)} over 5 days — ${sentenceCase(r.trend.move)}.`);
    if (r.driver && r.driver.driver !== "NONE") lines.push(`10Y driver: ${sentenceCase(r.driver.driver)}.`);
  }
  if (c) lines.push(`Credit: ${sentenceCase(c.state)}.`);

  const make = (label: string, detail: string, categories: ReleaseCategory[], why: string): MacroFocus => ({
    label,
    detail,
    categories,
    evidence: {
      title: `Why "${label}"?`,
      lines: [...lines, why],
      note: "Inferred from what rates and credit are repricing. Releases in the focus categories matter more than usual.",
    },
  });

  const creditWeak = c ? c.vital.signal === "warning" || c.vital.signal === "stress" : false;
  const move = r?.trend.move ?? "STABLE";
  const rising = move === "BEAR STEEPENING" || move === "BEAR FLATTENING" || move === "PARALLEL SHIFT HIGHER";
  const falling = move === "BULL STEEPENING" || move === "BULL FLATTENING" || move === "PARALLEL SHIFT LOWER";
  const frontMove =
    r && clears(r.y2.d5, RATES.level.rank, RATES.level.floorBp["5D"], RATES.level.fallbackBp["5D"])
      ? r.y2.d5.value
      : 0;

  if (creditWeak && rising) {
    return make(
      "Inflation vs growth tradeoff",
      "Yields are rising while credit weakens — the market is weighing sticky inflation against a slowing economy.",
      ["INFLATION", "GROWTH", "LABOR"],
      "Rising yields alongside deteriorating credit.",
    );
  }
  if (creditWeak) {
    return make(
      "Recession risk",
      `Credit is ${c!.state.toLowerCase()}${falling ? " while yields fall" : ""} — labor and growth data that confirm or deny a slowdown carry the most weight.`,
      ["LABOR", "GROWTH"],
      "Credit deterioration is the lead signal.",
    );
  }
  if (frontMove > 0) {
    return make(
      "Fed easing expectations",
      `2Y yields ${bp(frontMove)} in 5 days — easing expectations are being pared back, so inflation and labor surprises that move the Fed path matter most.`,
      ["INFLATION", "LABOR", "FED"],
      "A large front-end move means the market is repricing the Fed path.",
    );
  }
  if (frontMove < 0) {
    return make(
      "Fed easing expectations",
      `2Y yields ${bp(frontMove)} in 5 days — the market is pricing more easing; labor and inflation data will confirm or challenge it.`,
      ["LABOR", "INFLATION", "FED"],
      "A large front-end move means the market is repricing the Fed path.",
    );
  }
  if (rising) {
    if (r?.driver?.driver === "INFLATION EXPECTATIONS") {
      return make(
        "Inflation persistence",
        "Long-end yields are rising on inflation expectations — inflation data matter most.",
        ["INFLATION", "FED"],
        "Breakevens, not real yields, are lifting the 10Y.",
      );
    }
    if (r?.driver?.driver === "REAL YIELDS") {
      return make(
        "Growth resilience",
        "Long-end real yields are rising — the market is pricing a firmer economy, so growth and labor data matter most.",
        ["GROWTH", "LABOR"],
        "Real yields, not breakevens, are lifting the 10Y.",
      );
    }
    return make(
      "Inflation vs growth tradeoff",
      "Yields are rising on a mix of inflation and real-yield pressure — both inflation and growth data matter.",
      ["INFLATION", "GROWTH"],
      "No single driver dominates the 10Y.",
    );
  }
  if (move === "BULL FLATTENING") {
    return make(
      "Growth resilience",
      "Long-end yields are falling faster than the front end — the market is questioning long-run growth, so growth data matter most.",
      ["GROWTH", "LABOR"],
      "The long end is leading yields lower.",
    );
  }

  // Nothing is being repriced: say so, and name the next scheduled test.
  const next =
    PRIORITY.slice(0, 3)
      .map((cat) => upcomingMajor.find((u) => u.category === cat))
      .filter((u): u is Release => Boolean(u))
      .sort((x, y) => Date.parse(x.time) - Date.parse(y.time))[0] ?? upcomingMajor[0];

  return make(
    "No dominant theme",
    next
      ? `Rates and credit show no clear macro driver; the next key test is ${next.name} (${relativeDay(etParts(Date.parse(next.time)).key, today)}).`
      : "Rates and credit show no clear macro driver.",
    next?.category ? [next.category] : [],
    "No large front-end, long-end or credit repricing.",
  );
}
