import { analyze } from "@/lib/engine";
import { etInstant } from "@/lib/engine/session";
import { baseline } from "@/lib/scenarios";
import { buildScenario, type ScenarioSpec } from "@/lib/synthetic";

/** Thursday Sep 10 2026, 11:00 ET — a normal session with the cash market open. */
export const WEEKDAY_RTH = etInstant("2026-09-10", 11 * 60);

/** Saturday Sep 12 2026, 10:00 ET. */
export const SATURDAY = etInstant("2026-09-12", 10 * 60);

export const et = etInstant;

/** Runs the full engine on the calm baseline with the given overrides. */
export function run(overrides: Partial<ScenarioSpec> = {}, now = WEEKDAY_RTH) {
  const spec: ScenarioSpec = { ...baseline(now), ...overrides, now };
  return analyze(buildScenario(spec));
}
