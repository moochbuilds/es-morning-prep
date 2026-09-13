/** Formatting + Eastern Time helpers. All market times render in ET. */

export const ET_ZONE = "America/New_York";

const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const timeWithSecondsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_ZONE,
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

const longDateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_ZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
});

export function etTime(iso: string | number | Date): string {
  return timeFmt.format(new Date(iso)).replace(/ /g, " ");
}

export function etTimeWithSeconds(iso: string | number | Date): string {
  return timeWithSecondsFmt.format(new Date(iso)).replace(/ /g, " ");
}

export function etLongDate(iso: string | number | Date): string {
  return longDateFmt.format(new Date(iso));
}

/** "Sep 10" from a YYYY-MM-DD observation date (no timezone shift). */
export function dateKeyLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

const MINUS = "−";

/** Rounds first so a tiny negative never renders as "−0.00". */
function signOf(rounded: number): string {
  return rounded > 0 ? "+" : rounded < 0 ? MINUS : "";
}

/** "+0.42%" / "−1.30%" */
export function pct(value: number, digits = 2): string {
  const r = Number(value.toFixed(digits));
  return `${signOf(r)}${Math.abs(r).toFixed(digits)}%`;
}

/** "+32 bp" / "−6 bp" / "0 bp" */
export function bp(value: number): string {
  const r = Math.round(value);
  return `${signOf(r)}${Math.abs(r)} bp`;
}

/** Unsigned level: "270 bp" */
export function bpLevel(value: number): string {
  return `${Math.round(value)} bp`;
}

/** Relative performance in percentage points: "+0.50 pts" */
export function pts(value: number, digits = 2): string {
  const r = Number(value.toFixed(digits));
  return `${signOf(r)}${Math.abs(r).toFixed(digits)} pts`;
}

export function yieldPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

/** 1 -> "1st", 22 -> "22nd", 38 -> "38th" */
export function ordinal(n: number): string {
  const r = Math.round(n);
  const tens = r % 100;
  if (tens >= 11 && tens <= 13) return `${r}th`;
  return `${r}${["th", "st", "nd", "rd"][r % 10] ?? "th"}`;
}

export function ratio(value: number): string {
  return `${value.toFixed(1)} : 1`;
}

export function minutesLabel(minutes: number): string {
  if (minutes < 0) return "now";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  const d = Math.floor(minutes / (24 * 60));
  const h = Math.floor((minutes % (24 * 60)) / 60);
  return h === 0 ? `${d}d` : `${d}d ${h}h`;
}

/** Elapsed-time label for freshness footers: "12s ago", "4 min ago". */
export function ago(iso: string | null, now: number): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
