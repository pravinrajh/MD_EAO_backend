import type { ReminderFrequency, ReminderWeekday } from "../../utils/constants";
import { REMINDER_WEEKDAYS } from "../../utils/constants";
import type { ReminderRecurrence } from "../../models/Reminder";
import { addZonedDays, addZonedMonths, getZonedDateTimeParts } from "../../utils/timezone";

export type RecurrenceInput = {
  enabled: boolean;
  frequency: ReminderFrequency;
  interval: number;
  daysOfWeek?: ReminderWeekday[];
  endAt?: Date | null;
};

export function normalizeRecurrence(input?: RecurrenceInput | null): ReminderRecurrence {
  if (!input || !input.enabled) {
    return { enabled: false, frequency: "WEEKLY", interval: 1, daysOfWeek: [], endAt: null };
  }
  return {
    enabled: true,
    frequency: input.frequency,
    interval: Math.min(Math.max(input.interval || 1, 1), 30),
    daysOfWeek: input.daysOfWeek ?? [],
    endAt: input.endAt ?? null,
  };
}

export function computeNextRunAt(from: Date, recurrence: RecurrenceInput, timeZone: string): Date | null {
  if (!recurrence.enabled) return null;
  const interval = Math.min(Math.max(recurrence.interval || 1, 1), 30);

  let next: Date;
  if (recurrence.frequency === "DAILY") {
    next = addZonedDays(from, interval, timeZone);
  } else if (recurrence.frequency === "MONTHLY") {
    next = addZonedMonths(from, interval, timeZone);
  } else if (recurrence.daysOfWeek && recurrence.daysOfWeek.length > 0) {
    next = nextMatchingWeekday(from, recurrence.daysOfWeek, interval, timeZone);
  } else {
    next = addZonedDays(from, 7 * interval, timeZone);
  }

  if (recurrence.endAt && next.getTime() > recurrence.endAt.getTime()) return null;
  return next;
}

function nextMatchingWeekday(
  from: Date,
  daysOfWeek: ReminderWeekday[],
  interval: number,
  timeZone: string,
): Date {
  const wanted = new Set(daysOfWeek);
  for (let offset = 1; offset <= 7 * interval + 7; offset += 1) {
    const candidate = addZonedDays(from, offset, timeZone);
    const weekday = getZonedDateTimeParts(candidate, timeZone).weekday.toUpperCase() as ReminderWeekday;
    if (!REMINDER_WEEKDAYS.includes(weekday) || !wanted.has(weekday)) continue;
    if (interval > 1 && offset < 7 * interval && weekday === daysOfWeek[0]) {
      continue;
    }
    return candidate;
  }
  return addZonedDays(from, 7 * interval, timeZone);
}
