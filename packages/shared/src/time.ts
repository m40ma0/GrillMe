function zoneParts(timeZone: string, utcMs: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value]),
  );
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day), hh: Number(parts.hour), mm: Number(parts.minute), ss: Number(parts.second) };
}

function zoneOffsetMs(timeZone: string, utcMs: number): number {
  const p = zoneParts(timeZone, utcMs);
  return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - utcMs;
}

/** Converts a wall-clock time in an IANA zone to an ISO instant. `month` is 0-based. */
export function zonedToIso(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): string {
  const guess = Date.UTC(year, month, day, hour, minute);
  let utc = guess - zoneOffsetMs(timeZone, guess);
  utc = guess - zoneOffsetMs(timeZone, utc);
  return new Date(utc).toISOString();
}

/** ISO instant to a `datetime-local` value (YYYY-MM-DDTHH:mm) in the given zone. */
export function isoToLocalInput(iso: string, timeZone: string): string {
  const p = zoneParts(timeZone, Date.parse(iso));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.hh)}:${pad(p.mm)}`;
}

/** A `datetime-local` value read in the given zone, as an ISO instant. */
export function localInputToIso(value: string, timeZone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  return zonedToIso(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), timeZone);
}
