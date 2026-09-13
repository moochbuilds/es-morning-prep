import type { Lean, Signal, Tone, Trend } from "@/lib/types";

/** Colour follows the interpretation of a signal, never a raw sign. */
export function toneForSignal(signal: Signal): Tone {
  switch (signal) {
    case "confirming":
      return "constructive";
    case "warning":
      return "caution";
    case "stress":
      return "stressed";
    default:
      return "neutral";
  }
}

export function leanForSignal(signal: Signal): Lean {
  if (signal === "confirming") return "risk-on";
  if (signal === "neutral") return "neutral";
  return "risk-off";
}

/** "BEAR STEEPENING" -> "Bear steepening" */
export function sentenceCase(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function arrow(value: number, meaningful: boolean): Trend {
  if (!meaningful || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}

/** "a, b and c" */
export function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
