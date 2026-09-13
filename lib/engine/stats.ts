/**
 * Small, dependency-free statistics used to judge moves against their own
 * history. The main tool is `rankOfAbs`: "this move is larger than N% of
 * same-length moves in the past year". That is more honest than a z-score for
 * fat-tailed market series, and it reads naturally in the UI.
 */

import type { MoveStat } from "@/lib/types";

export const round = (v: number, dp = 2): number =>
  Math.round(v * 10 ** dp) / 10 ** dp;

/** values[i] - values[i - lag], for every i where both exist. */
export function lagChanges(values: number[], lag: number): number[] {
  const out: number[] = [];
  for (let i = lag; i < values.length; i++) out.push(values[i] - values[i - lag]);
  return out;
}

/** Percentage change over `lag` observations. */
export function pctChanges(values: number[], lag: number): number[] {
  const out: number[] = [];
  for (let i = lag; i < values.length; i++) {
    const base = values[i - lag];
    if (base !== 0) out.push((values[i] / base - 1) * 100);
  }
  return out;
}

/**
 * Share (0-100) of historical moves whose size is below |x|. Null when the
 * history is too short to rank against — callers then use fixed fallbacks.
 */
export function rankOfAbs(x: number, sample: number[], minN: number): number | null {
  if (sample.length < minN) return null;
  const size = Math.abs(x);
  let below = 0;
  for (const s of sample) if (Math.abs(s) < size) below++;
  return Math.round((below / sample.length) * 100);
}

/** Percentile (0-100) of a level within a sample. */
export function percentileOf(x: number, sample: number[], minN: number): number | null {
  if (sample.length < minN) return null;
  let below = 0;
  for (const s of sample) if (s < x) below++;
  return Math.round((below / sample.length) * 100);
}

export function moveStat(value: number, sample: number[], minN: number): MoveStat {
  return { value, rank: rankOfAbs(value, sample, minN) };
}

/**
 * A move is significant when it clears the fixed floor AND either ranks above
 * the threshold or — without enough history — clears the fallback size.
 */
export function clears(
  stat: MoveStat,
  rank: number,
  floor: number,
  fallback: number,
): boolean {
  const size = Math.abs(stat.value);
  if (size < floor) return false;
  return stat.rank === null ? size >= fallback : stat.rank >= rank;
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** "Larger than 88% of 5-day moves over the past 3 years." */
export function rankPhrase(stat: MoveStat, window: string, span: string): string | null {
  if (stat.rank === null) return null;
  return `Larger than ${stat.rank}% of ${window} moves over the past ${span}.`;
}

/** Human span for a count of daily observations: "year", "3 years", "3 months". */
export function spanOf(observations: number): string {
  if (observations >= 400) return `${Math.round(observations / 252)} years`;
  if (observations >= 200) return "year";
  return `${Math.max(1, Math.round(observations / 21))} months`;
}
