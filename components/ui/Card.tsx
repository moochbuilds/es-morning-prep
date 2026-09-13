import type { ReactNode } from "react";

import type { GlossaryKey } from "@/config/glossary";

import { Info } from "./Popover";

export function Card({
  title,
  info,
  badge,
  emphasis = false,
  className = "",
  children,
}: {
  title: string;
  info?: GlossaryKey;
  /** Right side of the header — usually the data-freshness badge. */
  badge?: ReactNode;
  /** Today's Read sits slightly forward of the surrounding cards. */
  emphasis?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={[
        "flex h-full w-full flex-col rounded-card border",
        emphasis
          ? "border-line bg-surface-2 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]"
          : "border-line-soft bg-surface",
        className,
      ].join(" ")}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 pt-4">
        <h2 className="eyebrow flex items-center gap-1.5">
          {title}
          {info && <Info term={info} />}
        </h2>
        {badge}
      </header>
      <div className="flex flex-1 flex-col px-5 pb-5 pt-3">{children}</div>
    </section>
  );
}
