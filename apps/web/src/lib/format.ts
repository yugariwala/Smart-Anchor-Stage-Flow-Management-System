/**
 * Display formatting only.
 *
 * This is NOT scheduling arithmetic: it converts a minute offset the server already decided
 * into a clock string for the event timezone, and formats a countdown. No plan is computed
 * here, no interval is derived, nothing is compared against a rule. Asia/Kolkata is UTC+05:30
 * with no DST, so a fixed offset is exact for the only timezone §12 allows.
 */

const KOLKATA_OFFSET_MIN = 330;

/** A minute offset from `startsAt`, rendered as HH:MM in the event timezone. */
export const localTime = (startsAt: string, minuteOffset: number): string => {
  const at = new Date(Date.parse(startsAt) + (minuteOffset + KOLKATA_OFFSET_MIN) * 60_000);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(at.getUTCHours())}:${p(at.getUTCMinutes())}`;
};

/** An ISO instant, rendered as HH:MM in the event timezone. */
export const localTimeOf = (startsAt: string, iso: string): string =>
  localTime(startsAt, Math.round((Date.parse(iso) - Date.parse(startsAt)) / 60_000));

export const signedMinutes = (n: number): string => (n > 0 ? `+${n}` : `${n}`);
