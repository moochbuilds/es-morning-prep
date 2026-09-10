/**
 * Precomputes the dashboard as static JSON.
 *
 * The site is a static export, and this script is the only thing that talks to
 * market-data providers. It runs on a schedule in GitHub Actions (and every
 * couple of minutes under `npm run dev`), so data is fetched once per refresh
 * for everyone rather than once per viewer per poll. The per-request pattern
 * is what exhausted serverless credits.
 *
 * Runs with the react-server export condition so `server-only` resolves to its
 * empty module; see the `data` script in package.json.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  deriveScores,
  getDashboardData,
  getInterpretation,
} from "@/services/dashboard";
import type { Block, DashboardData } from "@/lib/types";

const OUT_DIR = path.join(process.cwd(), "public", "data");

const BLOCKS = [
  "futures",
  "breadth",
  "sectors",
  "rates",
  "volatility",
  "credit",
  "calendar",
  "earnings",
] as const;

type BlockKey = (typeof BLOCKS)[number];

/**
 * The currently published snapshot. Every run starts with an empty in-memory
 * cache, so this is where "last known good" comes from when a provider fails.
 */
async function previousSnapshot(): Promise<DashboardData | null> {
  const url = process.env.PREVIOUS_SNAPSHOT_URL;
  if (!url) return null;
  try {
    const res = await fetch(`${url}?t=${Date.now()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok ? ((await res.json()) as DashboardData) : null;
  } catch {
    return null;
  }
}

/** Replaces failed blocks with the previous good reading, marked STALE. */
function carryForward(
  current: DashboardData,
  previous: DashboardData | null,
): BlockKey[] {
  if (!previous) return [];
  const blocks = current as unknown as Record<BlockKey, Block<unknown>>;
  const prior = previous as unknown as Partial<Record<BlockKey, Block<unknown>>>;
  const carried: BlockKey[] = [];

  for (const key of BLOCKS) {
    const failed = blocks[key];
    const lastGood = prior[key];
    if (failed.data !== null || !lastGood || lastGood.data === null) continue;
    blocks[key] = {
      data: lastGood.data,
      freshness: {
        ...lastGood.freshness,
        status: "STALE",
        note: `Provider error — showing last good reading. (${failed.freshness.note ?? "unavailable"})`,
      },
    };
    carried.push(key);
  }
  return carried;
}

async function main(): Promise<void> {
  const started = Date.now();
  const [data, previous] = await Promise.all([
    getDashboardData(),
    previousSnapshot(),
  ]);

  const carried = carryForward(data, previous);
  if (carried.length > 0) data.derived = deriveScores(data, Date.now());

  if (BLOCKS.every((key) => data[key].data === null)) {
    // A network failure on the runner would otherwise publish an empty
    // dashboard over a good one. Failing the job leaves the live site as is.
    throw new Error("No provider returned data and there is no previous snapshot.");
  }

  const interpretation = await getInterpretation(data);

  await mkdir(OUT_DIR, { recursive: true });
  await Promise.all([
    writeFile(path.join(OUT_DIR, "dashboard.json"), JSON.stringify(data)),
    writeFile(
      path.join(OUT_DIR, "interpretation.json"),
      JSON.stringify(interpretation),
    ),
  ]);

  const statuses = BLOCKS.map((key) => `${key}=${data[key].freshness.status}`);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`[data] ${statuses.join(" ")} (${elapsed}s)`);
  if (carried.length > 0) {
    console.log(`[data] carried forward: ${carried.join(", ")}`);
  }
}

main()
  // Explicit exit: idle keep-alive sockets can otherwise hold the process open.
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[data] failed:", error);
    process.exit(1);
  });
