/**
 * Validate a UTC producer timestamp without passing through JavaScript Date.
 * Three-digit milliseconds are equivalent only to a zero microsecond tail.
 * The returned six-digit value is for comparison; command payloads retain their original text.
 */
export function canonicalPrincipalSourceTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3}|\d{6})Z$/u.exec(value);
  if (!match || match[0] !== value) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (year < 1 || month < 1 || month > 12 || day < 1 ||
    hour > 23 || minute > 59 || second > 59) return null;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > days[month - 1]) return null;
  return value.slice(0, 20) + fraction.padEnd(6, "0") + "Z";
}
