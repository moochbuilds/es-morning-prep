import "server-only";

import { NotConfiguredError } from "./providers/live";

/**
 * Data-mode switch.
 *
 * `live` (the default) routes to the real adapters. Domains whose live adapter
 * is not implemented yet fall back to mock data that is explicitly labelled
 * MOCK in the UI, so a partly-wired dashboard is honest rather than broken.
 *
 * Set DATA_MODE=mock to force the whole page onto mock data.
 */
export type DataMode = "mock" | "live";

export const MOCK_SOURCE = "MOCK";

export function dataMode(): DataMode {
  return process.env.DATA_MODE === "mock" ? "mock" : "live";
}

export interface Resolved<T> {
  value: T;
  source: string;
}

/**
 * Runs the live provider, falling back to mock ONLY when that provider is not
 * implemented. Genuine failures (network, bad response, low coverage) are
 * rethrown so the cache layer can degrade the block to STALE/UNAVAILABLE —
 * silently substituting mock data for a real outage would be a lie.
 */
export async function resolveProvider<T>(
  live: () => Promise<T>,
  mock: () => Promise<T>,
  liveSource: string,
): Promise<Resolved<T>> {
  if (dataMode() === "live") {
    try {
      return { value: await live(), source: liveSource };
    } catch (error) {
      if (!(error instanceof NotConfiguredError)) throw error;
      console.warn(`[data] ${liveSource} not configured — serving mock.`);
    }
  }
  return { value: await mock(), source: MOCK_SOURCE };
}
