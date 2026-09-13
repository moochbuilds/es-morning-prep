"use client";

import { useId, type ReactNode } from "react";

import { GLOSSARY, type GlossaryKey } from "@/config/glossary";
import type { Evidence } from "@/lib/types";

type Align = "left" | "center" | "right";

const ALIGN: Record<Align, string> = {
  left: "left-0",
  center: "left-1/2 -translate-x-1/2",
  right: "right-0",
};

/**
 * CSS-only hover/focus popover (no JS state), so it works for keyboard users
 * and costs nothing to render.
 */
export function Popover({
  trigger,
  children,
  align = "left",
  wide = false,
  label,
  triggerClassName = "",
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: Align;
  wide?: boolean;
  /** Accessible name when the trigger has no text of its own. */
  label?: string;
  triggerClassName?: string;
}) {
  const id = useId();
  return (
    <span className="group/pop relative inline-flex items-center">
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        className={`rounded-sm text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-ink-3 ${triggerClassName}`}
      >
        {trigger}
      </button>
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none invisible absolute top-full z-40 mt-2 ${
          wide ? "w-80" : "w-64"
        } max-w-[calc(100vw-2.5rem)] ${ALIGN[align]} rounded-md border border-line bg-surface-2 px-3 py-2.5 text-left text-2xs font-normal normal-case leading-relaxed tracking-normal text-ink-2 opacity-0 shadow-lg shadow-black/50 transition-opacity duration-150 group-focus-within/pop:visible group-focus-within/pop:opacity-100 group-hover/pop:visible group-hover/pop:opacity-100`}
      >
        {children}
      </span>
    </span>
  );
}

/** The small "i" beside a term: a one- or two-sentence definition. */
export function Info({ term, align = "left" }: { term: GlossaryKey; align?: Align }) {
  return (
    <Popover
      align={align}
      label="What does this mean?"
      trigger={
        <span className="flex h-[14px] w-[14px] items-center justify-center rounded-full border border-line text-[9px] font-medium normal-case leading-none tracking-normal text-ink-3 transition-colors hover:border-ink-3 hover:text-ink-2">
          i
        </span>
      }
    >
      {GLOSSARY[term]}
    </Popover>
  );
}

/**
 * A classification label that shows its evidence on hover: "Why bear
 * steepening? 2Y +3 bp, 10Y +11 bp …". This is what lets the page teach.
 */
export function Why({
  evidence,
  children,
  align = "left",
  className = "",
}: {
  evidence: Evidence;
  children: ReactNode;
  align?: Align;
  className?: string;
}) {
  return (
    <Popover
      align={align}
      wide
      triggerClassName={`cursor-help underline decoration-ink-3/60 decoration-dotted decoration-1 underline-offset-4 ${className}`}
      trigger={children}
    >
      <span className="block font-medium text-ink">{evidence.title}</span>
      <span className="mt-1.5 block space-y-1">
        {evidence.lines.map((line, i) => (
          <span key={i} className="block">
            {line}
          </span>
        ))}
      </span>
      {evidence.note && <span className="mt-2 block text-ink-3">{evidence.note}</span>}
    </Popover>
  );
}
