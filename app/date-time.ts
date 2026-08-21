export const browserTimezone =
  typeof Intl !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    : "UTC";

/** Format an instant as a datetime-local value in the requested IANA zone. */
export function localInput(date: Date, timezone = browserTimezone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function wallClockMillis(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return Number.NaN;
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
}

function wallClockValue(milliseconds: number) {
  const date = new Date(milliseconds);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/** Keep an end time's duration when a user moves the start time. */
export function shiftEndWithStartChange(
  previousStart: string,
  previousEnd: string,
  nextStart: string,
) {
  const oldStart = wallClockMillis(previousStart);
  const oldEnd = wallClockMillis(previousEnd);
  const next = wallClockMillis(nextStart);
  if (![oldStart, oldEnd, next].every(Number.isFinite) || oldEnd <= oldStart)
    return previousEnd;
  return wallClockValue(next + oldEnd - oldStart);
}
