import { CROSS } from "@/config/thresholds";
import type { Divergence } from "@/lib/types";

import { SEVERITY_TONE, TONE_BORDER, TONE_TEXT } from "./ui/tone";

const COLS: Record<number, string> = { 1: "", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3" };

/**
 * Cross-market disagreements, directly beneath Today's Read. When markets
 * disagree, that disagreement is the information — so it gets its own strip
 * rather than being averaged into a number.
 */
export function DivergenceStrip({ divergences }: { divergences: Divergence[] }) {
  const shown = divergences.slice(0, CROSS.maxDivergencesShown);
  const hidden = divergences.length - shown.length;

  if (shown.length === 0) {
    return (
      <p className="rounded-card border border-line-soft bg-surface px-5 py-2.5 text-2xs text-ink-3">
        Cross-market divergence: <span className="text-ink-2">None significant</span> — rates, credit,
        volatility and equities are not contradicting each other.
      </p>
    );
  }

  return (
    <section aria-label="Cross-market divergence" className={`grid grid-cols-1 gap-3 ${COLS[shown.length] ?? ""}`}>
      {shown.map((d) => {
        const tone = SEVERITY_TONE[d.severity];
        return (
          <article
            key={d.id}
            className={`rounded-card border border-l-2 border-line-soft bg-surface px-4 py-3 ${TONE_BORDER[tone]}`}
          >
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className={`text-2xs font-semibold tracking-[0.12em] ${TONE_TEXT[tone]}`}>{d.title}</span>
              <span className="text-2xs uppercase tracking-wider text-ink-3">{d.severity}</span>
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-2">{d.detail}</p>
          </article>
        );
      })}
      {hidden > 0 && (
        <p className="text-2xs text-ink-3 lg:col-span-full">
          {hidden} lower-priority divergence{hidden > 1 ? "s" : ""} not shown.
        </p>
      )}
    </section>
  );
}
