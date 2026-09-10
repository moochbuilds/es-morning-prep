/**
 * Minimal server-side TTL cache with last-known-good retention and failure
 * backoff.
 *
 * Three jobs:
 *  1. Keep us from hammering vendor APIs on every page poll.
 *  2. Preserve the last successful value so a failing provider degrades to
 *     STALE-with-a-value instead of an empty card.
 *  3. Stop a dead provider from gating the whole page. Without backoff, a
 *     provider that always fails is retried on every request and pays its full
 *     timeout each time — and since the dashboard fans out with Promise.all,
 *     that one provider sets the latency for all eight blocks.
 */

import type { Block, Freshness } from "./types";
import { statusForAge } from "./freshness";

interface Entry<T> {
  value: T;
  fetchedAt: number;
  sourceTimestamp: string | null;
  source: string;
}

interface Failure {
  at: number;
  count: number;
  message: string;
}

const store = new Map<string, Entry<unknown>>();
const failures = new Map<string, Failure>();

/** Backoff after a failure: 30s, 60s, 120s ... capped at 10 minutes. */
const FAILURE_BASE_MS = 30_000;
const FAILURE_MAX_MS = 600_000;

const cooldownFor = (count: number): number =>
  Math.min(FAILURE_BASE_MS * 2 ** (count - 1), FAILURE_MAX_MS);

export interface FetchOptions<T> {
  key: string;
  ttlMs: number;
  /** Fallback label; a fetcher may override it (e.g. live vs mock fallback). */
  source: string;
  fetcher: () => Promise<{
    value: T;
    sourceTimestamp?: string | null;
    source?: string;
  }>;
}

/**
 * Returns a Block, never throws. On provider failure the last good value is
 * returned with a downgraded status and an explanatory note.
 */
export async function cached<T>({
  key,
  ttlMs,
  source,
  fetcher,
}: FetchOptions<T>): Promise<Block<T>> {
  const now = Date.now();
  const existing = store.get(key) as Entry<T> | undefined;

  if (existing && now - existing.fetchedAt < ttlMs) {
    return { data: existing.value, freshness: toFreshness(existing, now) };
  }

  // Recently failed and still cooling down: answer immediately from whatever we
  // have rather than paying the provider's timeout again.
  const failure = failures.get(key);
  if (failure && now - failure.at < cooldownFor(failure.count)) {
    return degraded(existing, now, source, failure);
  }

  try {
    const resolved = await fetcher();
    const entry: Entry<T> = {
      value: resolved.value,
      fetchedAt: now,
      sourceTimestamp: resolved.sourceTimestamp ?? new Date(now).toISOString(),
      source: resolved.source ?? source,
    };
    store.set(key, entry);
    failures.delete(key);
    return { data: resolved.value, freshness: toFreshness(entry, now) };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Provider unavailable.";
    // Provider errors are logged server-side only.
    console.error(`[data] provider "${key}" failed:`, error);

    const next: Failure = {
      at: now,
      count: (failures.get(key)?.count ?? 0) + 1,
      message,
    };
    failures.set(key, next);
    return degraded(existing, now, source, next);
  }
}

function degraded<T>(
  existing: Entry<T> | undefined,
  now: number,
  source: string,
  failure: Failure,
): Block<T> {
  if (existing) {
    return {
      data: existing.value,
      freshness: {
        ...toFreshness(existing, now),
        status: "STALE",
        note: `Provider error — showing last good reading. (${failure.message})`,
      },
    };
  }
  return {
    data: null,
    freshness: {
      status: "UNAVAILABLE",
      sourceTimestamp: null,
      lastSuccessfulUpdate: null,
      source,
      note: failure.message,
    },
  };
}

function toFreshness<T>(entry: Entry<T>, now: number): Freshness {
  return {
    status: statusForAge(now - entry.fetchedAt),
    sourceTimestamp: entry.sourceTimestamp,
    lastSuccessfulUpdate: new Date(entry.fetchedAt).toISOString(),
    source: entry.source,
  };
}

/** Test/manual-refresh hook. */
export function invalidate(key?: string): void {
  if (key) {
    store.delete(key);
    failures.delete(key);
  } else {
    store.clear();
    failures.clear();
  }
}
