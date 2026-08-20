function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(utcGuess)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  const asWallClock = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  return new Date(utcGuess.getTime() - (asWallClock - utcGuess.getTime()));
}

export function getZonedDayRange(
  now: Date,
  timeZone: string,
): {
  start: Date;
  end: Date;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);

  const start = zonedWallTimeToUtc(year, month, day, 0, 0, 0, timeZone);
  const next = zonedWallTimeToUtc(year, month, day + 1, 0, 0, 0, timeZone);

  return { start, end: next };
}

export function zonedDateFromParts(year: number, month: number, day: number, timeZone: string): Date {
  return zonedWallTimeToUtc(year, month, day, 0, 0, 0, timeZone);
}

export function zonedDateTimeFromParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
  second = 0,
): Date {
  return zonedWallTimeToUtc(year, month, day, hour, minute, second, timeZone);
}

export function formatZonedDate(now: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

export function getZonedMonthRange(
  now: Date,
  timeZone: string,
): {
  start: Date;
  end: Date;
} {
  const [year, month] = formatZonedDate(now, timeZone).split("-").map(Number);
  const start = zonedWallTimeToUtc(year, month, 1, 0, 0, 0, timeZone);
  const end = zonedWallTimeToUtc(year, month + 1, 1, 0, 0, 0, timeZone);
  return { start, end };
}

/** Monday 00:00 through next Monday 00:00 in `timeZone`. */
export function getZonedWeekRange(
  now: Date,
  timeZone: string,
): {
  start: Date;
  end: Date;
} {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(now);
  const offset = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday);
  const { start: todayStart } = getZonedDayRange(now, timeZone);
  const start = new Date(todayStart.getTime() - Math.max(offset, 0) * 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function getZonedDateTimeParts(
  now: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "long",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: String(parts.weekday ?? ""),
  };
}

export function addZonedDays(now: Date, days: number, timeZone: string): Date {
  const parts = getZonedDateTimeParts(now, timeZone);
  return zonedDateTimeFromParts(parts.year, parts.month, parts.day + days, parts.hour, parts.minute, timeZone, parts.second);
}

export function addZonedMonths(now: Date, months: number, timeZone: string): Date {
  const parts = getZonedDateTimeParts(now, timeZone);
  return zonedDateTimeFromParts(parts.year, parts.month + months, parts.day, parts.hour, parts.minute, timeZone, parts.second);
}
