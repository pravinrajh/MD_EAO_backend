import { env } from "../../config/env";
import {
  formatZonedDate,
  getZonedDayRange,
  getZonedWeekRange,
  zonedDateTimeFromParts,
} from "../../utils/timezone";

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

function partsInZone(now: Date, timeZone: string) {
  const [year, month, day] = formatZonedDate(now, timeZone).split("-").map(Number);
  return { year, month, day };
}

function addDays(now: Date, days: number, timeZone: string) {
  const { start } = getZonedDayRange(now, timeZone);
  const shifted = new Date(start.getTime() + days * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000);
  return partsInZone(shifted, timeZone);
}

export function parseNaturalTime(phrase: string | undefined): { hour: number; minute: number } | null {
  if (!phrase) return null;
  const text = phrase.trim().toLowerCase().replace(/\s+/g, " ");
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i) || text.match(/^(\d{1,2})(am|pm)$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] && /^\d{2}$/.test(match[2]) ? match[2] : 0);
  const meridiem = (match[3] || match[2] || "").toLowerCase();
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  if (meridiem === "am" || meridiem === "pm") {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === "am" && hour === 12) hour = 0;
    if (meridiem === "pm" && hour !== 12) hour += 12;
  }
  if (hour > 23) return null;
  return { hour, minute };
}

export function parseNaturalDate(phrase: string | undefined, now = new Date(), timeZone = env.APP_TIMEZONE): Date | null {
  if (!phrase) return null;
  const text = phrase.trim().toLowerCase();
  const todayParts = partsInZone(now, timeZone);

  if (text === "today") {
    return zonedDateTimeFromParts(todayParts.year, todayParts.month, todayParts.day, 0, 0, timeZone);
  }
  if (text === "tomorrow") {
    const next = addDays(now, 1, timeZone);
    return zonedDateTimeFromParts(next.year, next.month, next.day, 0, 0, timeZone);
  }
  if (text === "yesterday") {
    const prev = addDays(now, -1, timeZone);
    return zonedDateTimeFromParts(prev.year, prev.month, prev.day, 0, 0, timeZone);
  }
  if (text === "next week") {
    const week = getZonedWeekRange(now, timeZone);
    const nextMonday = new Date(week.end.getTime() + 12 * 60 * 60 * 1000);
    const parts = partsInZone(nextMonday, timeZone);
    return zonedDateTimeFromParts(parts.year, parts.month, parts.day, 0, 0, timeZone);
  }

  const weekdayMatch = text.match(/^(this|next)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (weekdayMatch) {
    const modifier = weekdayMatch[1];
    const target = WEEKDAYS.indexOf(weekdayMatch[2] as (typeof WEEKDAYS)[number]);
    const weekdayLabel = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(now).toLowerCase();
    const current = WEEKDAYS.indexOf(weekdayLabel as (typeof WEEKDAYS)[number]);
    let delta = target - Math.max(current, 0);
    if (modifier === "next") {
      if (delta <= 0) delta += 7;
    } else if (delta < 0) {
      delta += 7;
    }
    const day = addDays(now, delta, timeZone);
    return zonedDateTimeFromParts(day.year, day.month, day.day, 0, 0, timeZone);
  }

  return null;
}

export function combineDateAndTime(
  date: Date,
  time: { hour: number; minute: number } | null,
  timeZone = env.APP_TIMEZONE,
  fallbackHour = 18,
): Date {
  const parts = partsInZone(date, timeZone);
  const hour = time?.hour ?? fallbackHour;
  const minute = time?.minute ?? 0;
  return zonedDateTimeFromParts(parts.year, parts.month, parts.day, hour, minute, timeZone);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}
