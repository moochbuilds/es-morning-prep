import type { Freshness } from "@/lib/types";

import { StatusBadge } from "./StatusBadge";
import { Tooltip } from "./Tooltip";

interface CardProps {
  title: string;
  tooltip?: string;
  freshness?: Freshness;
  now: number;
  /** Today's Read uses this to sit slightly forward of the surrounding cards. */
  emphasis?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Card({
  title,
  tooltip,
  freshness,
  now,
  emphasis = false,
  className = "",
  children,
}: CardProps) {
  return (
    <section
      className={[
        "flex w-full flex-col rounded-card border",
        emphasis
          ? "border-line bg-surface-2 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]"
          : "border-line-soft bg-surface",
        className,
      ].join(" ")}
    >
      <header className="flex items-center justify-between gap-3 px-5 pt-4">
        <h2 className="eyebrow flex items-center gap-1.5">
          {title}
          {tooltip && <Tooltip text={tooltip} />}
        </h2>
        {freshness && <StatusBadge freshness={freshness} now={now} />}
      </header>
      <div className="flex flex-1 flex-col px-5 pb-5 pt-3">{children}</div>
    </section>
  );
}
