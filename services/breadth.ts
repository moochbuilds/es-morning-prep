import "server-only";

import { cached } from "@/lib/cache";
import { REFRESH } from "@/config/thresholds";
import { BREADTH_UNIVERSE_LABEL } from "@/config/universe";
import type { Block, Breadth } from "@/lib/types";
import { resolveProvider } from "./mode";
import { mockBreadth } from "./providers/mock";
import { liveBreadth } from "./providers/live";

/** Labelled with the universe so the card never implies full S&P 500 breadth. */
const SOURCE = `Yahoo · ${BREADTH_UNIVERSE_LABEL}`;

export async function getBreadth(): Promise<Block<Breadth>> {
  return cached({
    key: "breadth",
    ttlMs: REFRESH.breadth,
    source: SOURCE,
    fetcher: () => resolveProvider(liveBreadth, mockBreadth, SOURCE),
  });
}
