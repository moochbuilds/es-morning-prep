import type { Block, CalendarEvent, EventRisk, Importance } from "@/lib/types";
import { etDateKey, etTime, etWeekdayShort, minutesLabel } from "@/lib/format";

import { Card } from "./ui/Card";
import { BlockUnavailable } from "./ui/StatusBadge";

const IMPORTANCE_STYLE: Record<Importance, string> = {
  HIGH: "text-neg",
  MED: "text-warn",
  LOW: "text-ink-3",
};

const RISK_TEXT = {
  LOW: "text-pos",
  MEDIUM: "text-warn",
  HIGH: "text-neg",
} as const;

export function CatalystCard({
  block,
  eventRisk,
  now,
}: {
  block: Block<CalendarEvent[]>;
  eventRisk: EventRisk;
  now: number;
}) {
  const events = block.data;

  // Weekends and holidays have no US releases; the provider falls forward to
  // the next session, and the card says so rather than pretending it's today.
  const nextSession =
    events && events.length > 0 && etDateKey(events[0].time) !== etDateKey(now)
      ? etWeekdayShort(events[0].time)
      : null;

  return (
    <Card
      title="Today's Catalysts"
      tooltip="US releases rated 2-star and above by TradingEconomics, plus any known market-moving print."
      freshness={block.freshness}
      now={now}
    >
      {nextSession && (
        <p className="-mt-1 mb-2 text-2xs text-warn/80">
          No releases today — showing next session, {nextSession}.
        </p>
      )}
      {!events ? (
        <BlockUnavailable label="Calendar" freshness={block.freshness} />
      ) : events.length === 0 ? (
        <p className="py-6 text-sm text-ink-3">
          No index-relevant catalysts scheduled.
        </p>
      ) : (
        <ul className="flex-1 space-y-0.5">
          {events.map((event) => {
            const past = new Date(event.time).getTime() <= now;
            const isNext = eventRisk.nextEvent?.event.id === event.id;
            return (
              <li
                key={event.id}
                className={`flex items-baseline gap-3 rounded px-2 py-2.5 ${
                  isNext ? "bg-surface-2" : ""
                } ${past ? "opacity-45" : ""}`}
              >
                <span className="readout w-[68px] shrink-0 text-xs text-ink-2">
                  {etTime(event.time)}
                </span>
                <span className="flex-1 truncate text-sm text-ink">
                  {event.title}
                </span>
                <span
                  className={`text-2xs font-semibold tracking-wider ${
                    IMPORTANCE_STYLE[event.importance]
                  }`}
                >
                  {event.importance}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="divider mt-4 space-y-2 pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="eyebrow">Next</span>
          <span className="text-xs text-ink">
            {eventRisk.nextEvent ? (
              <>
                {eventRisk.nextEvent.event.title}
                <span className="ml-2 text-ink-3">
                  {minutesLabel(eventRisk.nextEvent.minutesAway)}
                </span>
              </>
            ) : (
              <span className="text-ink-3">Nothing further today</span>
            )}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="eyebrow">Event Risk</span>
          <span
            className={`text-xs font-semibold ${RISK_TEXT[eventRisk.level]}`}
          >
            {eventRisk.level}
          </span>
        </div>
      </div>
    </Card>
  );
}
