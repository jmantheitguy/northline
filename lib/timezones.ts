export const DEFAULT_TIMEZONE = "UTC";

export function validTimezone(value: unknown) {
  const timezone = String(value || "").trim().slice(0, 80);
  if (!timezone) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return timezone;
  } catch {
    return null;
  }
}

export function zonedDateTimeToUtc(
  date: string,
  time: string,
  timezone: string,
) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const clock = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  const zone = validTimezone(timezone);
  if (!match || !clock || !zone) throw new Error("Invalid local date or time zone");
  const desired = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(clock[1]),
    Number(clock[2]),
    Number(clock[3] || 0),
  );
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let instant = desired;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(instant))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    );
    const represented = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    instant += desired - represented;
  }
  return new Date(instant);
}

/**
 * Parse a date-time received from a datetime-local control.  Such controls
 * intentionally have no offset, so interpreting them with `new Date(value)`
 * silently uses the server's time zone.  Northline stores instants in UTC and
 * therefore must resolve offset-less values in the user's persisted zone.
 * Explicit ISO timestamps remain supported for older clients and integrations.
 */
export function parseDateTimeInZone(value: unknown, timezone: string) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("Enter a date and time");
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const instant = new Date(raw);
    if (Number.isNaN(instant.valueOf())) throw new Error("Enter a valid date and time");
    return instant;
  }
  const normalized = raw.replace(" ", "T");
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)$/.exec(normalized);
  if (!match) throw new Error("Enter a valid date and time");
  return zonedDateTimeToUtc(match[1], match[2], timezone);
}
