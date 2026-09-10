"use client";

/**
 * Subtle info affordance. CSS-only (group-hover + focus-within) so it costs no
 * JavaScript and still works for keyboard users.
 */
export function Tooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center align-middle">
      <button
        type="button"
        aria-label={text}
        className="flex h-[14px] w-[14px] items-center justify-center rounded-full border border-line text-[9px] font-medium leading-none text-ink-3 transition-colors hover:border-ink-3 hover:text-ink-2 focus:outline-none focus-visible:border-ink-2 focus-visible:text-ink-2"
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-56 -translate-x-1/2 rounded-md border border-line bg-surface-2 px-3 py-2 text-2xs leading-relaxed text-ink-2 opacity-0 shadow-lg shadow-black/40 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
