/**
 * Mock providers, driven by the same synthetic-data builder the test suite
 * uses. Select a scenario with MOCK_SCENARIO (reference, stress,
 * credit-divergence, vol-shock). Nothing here touches the network, and the
 * data is rebuilt at most once a minute so repeated renders agree.
 */

import { MOCK_SCENARIOS, type ScenarioName } from "@/lib/scenarios";
import { buildScenario } from "@/lib/synthetic";
import type { RawBlocks } from "@/lib/types";

let memo: { minute: number; name: string; blocks: RawBlocks } | null = null;

function scenarioName(): ScenarioName {
  const name = process.env.MOCK_SCENARIO?.trim();
  return name && name in MOCK_SCENARIOS ? (name as ScenarioName) : "reference";
}

function blocks(): RawBlocks {
  const minute = Math.floor(Date.now() / 60_000);
  const name = scenarioName();
  if (!memo || memo.minute !== minute || memo.name !== name) {
    memo = { minute, name, blocks: buildScenario(MOCK_SCENARIOS[name](Date.now())) };
  }
  return memo.blocks;
}

function pick<K extends keyof RawBlocks>(key: K): () => Promise<NonNullable<RawBlocks[K]["data"]>> {
  return async () => {
    const data = blocks()[key].data;
    if (data === null) throw new Error(`Mock scenario has no ${key} data.`);
    return data as NonNullable<RawBlocks[K]["data"]>;
  };
}

export const mockFutures = pick("futures");
export const mockBreadth = pick("breadth");
export const mockSectors = pick("sectors");
export const mockRates = pick("rates");
export const mockCredit = pick("credit");
export const mockCreditProxy = pick("creditProxy");
export const mockVolatility = pick("volatility");
export const mockVixFutures = pick("vixFutures");
export const mockCalendar = pick("calendar");
export const mockEarnings = pick("earnings");
