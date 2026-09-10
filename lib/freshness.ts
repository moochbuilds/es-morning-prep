import { FRESHNESS } from "@/config/thresholds";
import type { Block, DataStatus } from "./types";

const RANK: Record<DataStatus, number> = {
  LIVE: 0,
  DELAYED: 1,
  STALE: 2,
  UNAVAILABLE: 3,
};

/** Status implied purely by how old a successful reading is. */
export function statusForAge(ageMs: number): DataStatus {
  if (ageMs >= FRESHNESS.staleAfterMs) return "STALE";
  if (ageMs >= FRESHNESS.delayedAfterMs) return "DELAYED";
  return "LIVE";
}

/**
 * Re-derives a block's status against the viewer's clock.
 *
 * Snapshots are published every few minutes and then sit on a CDN, so the
 * status written at generation time goes out of date. Without this, a snapshot
 * left behind by a paused refresh would keep claiming LIVE indefinitely.
 */
export function ageBlock<T>(block: Block<T>, now: number): Block<T> {
  const at = block.freshness.lastSuccessfulUpdate;
  if (block.data === null || !at) return block;

  const byAge = statusForAge(now - new Date(at).getTime());
  // Only ever downgrade: a block carried forward as STALE stays STALE.
  if (RANK[byAge] <= RANK[block.freshness.status]) return block;
  return { ...block, freshness: { ...block.freshness, status: byAge } };
}
