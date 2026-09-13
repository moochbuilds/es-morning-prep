import type {
  Alignment,
  CreditDirection,
  DivergenceSeverity,
  RiskLevel,
  Tone,
  Trend,
  VitalAlignment,
} from "@/lib/types";

/** Colour follows the interpretation, never the raw sign of a number. */
export const TONE_TEXT: Record<Tone, string> = {
  constructive: "text-pos",
  caution: "text-warn",
  stressed: "text-neg",
  neutral: "text-ink-2",
};

export const TONE_CHIP: Record<Tone, string> = {
  constructive: "border-pos/30 bg-pos-dim text-pos",
  caution: "border-warn/30 bg-warn-dim text-warn",
  stressed: "border-neg/30 bg-neg-dim text-neg",
  neutral: "border-line bg-neutral-dim text-ink-2",
};

export const TONE_DOT: Record<Tone, string> = {
  constructive: "bg-pos",
  caution: "bg-warn",
  stressed: "bg-neg",
  neutral: "bg-ink-3",
};

export const TONE_BORDER: Record<Tone, string> = {
  constructive: "border-l-pos",
  caution: "border-l-warn",
  stressed: "border-l-neg",
  neutral: "border-l-ink-3",
};

export const ARROW: Record<Trend, string> = { up: "↑", down: "↓", flat: "→" };

/** Event risk is catalyst risk: it is never green, because LOW is not "good". */
export const RISK_TONE: Record<RiskLevel, Tone> = { LOW: "neutral", MEDIUM: "caution", HIGH: "stressed" };

export const SEVERITY_TONE: Record<DivergenceSeverity, Tone> = {
  high: "stressed",
  medium: "caution",
  low: "neutral",
};

export const ALIGNMENT_TONE: Record<Alignment, Tone> = {
  STRONG: "constructive",
  MODERATE: "neutral",
  MIXED: "caution",
  "NO CLEAR SIGNAL": "neutral",
};

export const VITAL_ALIGNMENT_TONE: Record<VitalAlignment, Tone> = {
  CONSTRUCTIVE: "constructive",
  MIXED: "caution",
  STRESSED: "stressed",
  QUIET: "neutral",
};

export const DIRECTION_TONE: Record<CreditDirection, Tone> = {
  TIGHTENING: "constructive",
  STABLE: "neutral",
  WIDENING: "caution",
  "RAPIDLY WIDENING": "stressed",
};

/** "BEAR STEEPENING" -> "Bear steepening" */
export function sentence(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
}

/** Green/red for an index move — for equities the sign IS the interpretation. */
export function moveClass(changePct: number, flat = 0.1): string {
  if (Math.abs(changePct) < flat) return "text-ink-2";
  return changePct > 0 ? "text-pos" : "text-neg";
}
