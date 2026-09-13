/**
 * Precomputes the dashboard as static JSON.
 *
 * The site is a static export, and this script is the only thing that talks to
 * market-data providers. It runs on a schedule in GitHub Actions (and every
 * couple of minutes under `npm run dev`), so data is fetched once per refresh
 * for everyone rather than once per viewer per poll.
 *
 * Runs with the react-server export condition so `server-only` resolves to its
 * empty module; see the `data` script in package.json.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { analyze } from "@/lib/engine";
import { SCHEMA_VERSION, type Block, type DashboardData, type Interpretation } from "@/lib/types";
import { getDashboardData, getInterpretation } from "@/services/dashboard";

const OUT_DIR = path.join(process.cwd(), "public", "data");

const BLOCKS = [
  "futures",
  "breadth",
  "sectors",
  "rates",
  "credit",
  "creditProxy",
  "volatility",
  "vixFutures",
  "calendar",
  "earnings",
] as const;

type BlockKey = (typeof BLOCKS)[number];

/**
 * The currently published file. In CI it comes from the live site; locally it
 * is the last file this script wrote.
 */
async function previous<T>(file: string): Promise<T | null> {
  const base = process.env.PREVIOUS_SNAPSHOT_URL;
  try {
    if (base) {
      const url = base.replace(/dashboard\.json$/, file);
      const res = await fetch(`${url}?t=${Date.now()}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
      return res.ok ? ((await res.json()) as T) : null;
    }
    return JSON.parse(await readFile(path.join(OUT_DIR, file), "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * Replaces failed blocks with the previous good reading, marked STALE. Only
 * ever from a snapshot with the same schema: an older shape carried into the
 * new engine would be misread, not merely stale.
 */
function carryForward(current: DashboardData, prior: DashboardData | null): BlockKey[] {
  if (!prior || prior.schemaVersion !== SCHEMA_VERSION) return [];
  const blocks = current as unknown as Record<BlockKey, Block<unknown>>;
  const before = prior as unknown as Partial<Record<BlockKey, Block<unknown>>>;
  const carried: BlockKey[] = [];

  for (const key of BLOCKS) {
    const failed = blocks[key];
    const lastGood = before[key];
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
  const [data, priorData, priorRead] = await Promise.all([
    getDashboardData(),
    previous<DashboardData>("dashboard.json"),
    previous<Interpretation>("interpretation.json"),
  ]);

  const carried = carryForward(data, priorData);
  if (carried.length > 0) data.analysis = analyze(data);

  if (BLOCKS.every((key) => data[key].data === null)) {
    // A network failure on the runner would otherwise publish an empty
    // dashboard over a good one. Failing the job leaves the live site as is.
    throw new Error("No provider returned data and there is no previous snapshot.");
  }

  const interpretation = await getInterpretation(data, priorRead);

  await mkdir(OUT_DIR, { recursive: true });
  await Promise.all([
    writeFile(path.join(OUT_DIR, "dashboard.json"), JSON.stringify(data)),
    writeFile(path.join(OUT_DIR, "interpretation.json"), JSON.stringify(interpretation)),
  ]);

  const statuses = BLOCKS.map((key) => `${key}=${data[key].freshness.status}`);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`[data] ${statuses.join(" ")} (${elapsed}s)`);
  console.log(`[data] backdrop: ${data.analysis.synthesis.backdrop.label} · alignment ${data.analysis.synthesis.alignment.state} · read: ${interpretation.generatedBy}`);
  if (carried.length > 0) console.log(`[data] carried forward: ${carried.join(", ")}`);
}

main()
  // Explicit exit: idle keep-alive sockets can otherwise hold the process open.
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[data] failed:", error);
    process.exit(1);
  });
