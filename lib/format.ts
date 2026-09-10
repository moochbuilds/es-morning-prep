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

const shortDateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_ZONE,
  month: "short",
  day: "numeric",
});

export function etTime(iso: string | number | Date): string {
  return timeFmt.format(new Date(iso)).replace(/ /g, " ");
}

export function etTimeWithSeconds(iso: string | number | Date): string {
  return timeWithSecondsFmt.format(new Date(iso)).replace(/ /g, " ");
}

export function etLongDate(iso: string | number | Date): string {
  return longDateFmt.format(new Date(iso));
}

export function etShortDate(iso: string | number | Date): string {
  return shortDateFmt.format(new Date(iso));
}

/** "+0.42%" / "-1.30%" — always signed, always 2dp. */
/** YYYY-MM-DD in Eastern Time — for "is this actually today?" comparisons. */
export function etDateKey(iso: string | number | Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ET_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** "Mon, Aug 10" — used when catalysts belong to the next session. */
export function etWeekdayShort(iso: string | number | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ET_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export function pct(value: number, digits = 2): string {
  return `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(digits)}%`;
}

/** "+32 bp" / "-6 bp" */
export function bp(value: number): string {
  const rounded = Math.round(value);
  return `${rounded >= 0 ? "+" : "-"}${Math.abs(rounded)} bp`;
}

export function yieldPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function ratio(value: number): string {
  return `${value.toFixed(1)} : 1`;
}

export function minutesLabel(minutes: number): string {
  if (minutes < 0) return "now";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Elapsed-time label for freshness footers: "12s ago", "4 min ago". */
export function ago(iso: string | null, now: number): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)}h ago`;
}
