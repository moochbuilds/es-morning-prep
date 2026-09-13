import { readFile } from "node:fs/promises";
import path from "node:path";

import { Dashboard } from "@/components/Dashboard";
import { SCHEMA_VERSION, type DashboardData, type Interpretation } from "@/lib/types";

/**
 * Prerendered with the latest snapshot embedded, so the first paint has real
 * numbers without waiting on a fetch. The client then polls the same JSON files
 * for newer snapshots.
 */
async function readSnapshot<T>(file: string): Promise<T | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), "public", "data", file), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    // No snapshot yet: the client shows a waiting state and polls for one.
    return null;
  }
}

export default async function Page() {
  const [data, interpretation] = await Promise.all([
    readSnapshot<DashboardData>("dashboard.json"),
    readSnapshot<Interpretation>("interpretation.json"),
  ]);
  // A snapshot written by an older version of the app has a different shape.
  const current = data?.schemaVersion === SCHEMA_VERSION ? data : null;
  return (
    <Dashboard
      initialData={current}
      initialInterpretation={current ? interpretation : null}
    />
  );
}
