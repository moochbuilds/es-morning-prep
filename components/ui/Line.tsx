import type { ReactNode } from "react";

/**
 * The one key:value row used across every card: muted label left, the value
 * that matters right. Consistent rows are what make the page scannable.
 */
export function Line({
  label,
  children,
  className = "",
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 border-b border-line-soft py-2 last:border-b-0 ${className}`}>
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-ink-3">{label}</span>
      <span className="flex min-w-0 flex-wrap items-baseline justify-end gap-x-2 text-right text-sm">{children}</span>
    </div>
  );
}
