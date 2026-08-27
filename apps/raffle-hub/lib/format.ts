/** "0.0000000" → "0.00", "12.5000000" → "12.50". Falls back to the raw string. */
export function formatAmount(value: string | null): string {
  if (value === null) return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "GDDH372S…203WJY": keeps both ends, trims the middle. */
export function middleTruncate(value: string, start = 8, end = 6): string {
  if (value.length <= start + end + 1) return value;
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

export function shortAddress(address: string) {
  return middleTruncate(address, 4, 4);
}

/**
 * Bolivian time, formatted identically on the server and in the browser.
 *
 * `toLocaleString()` with no arguments reads the *host's* locale and zone, so
 * Node and the browser disagree and React reports a hydration mismatch. Pinning
 * both is not a workaround — it is the correct behaviour here: this app is for
 * a Bolivian audience, and a draw time is a promise. Everyone looking at the
 * same raffle must read the same instant, whatever device they are holding and
 * wherever they happen to be.
 *
 * Bolivia does not observe daylight saving, so La Paz is a stable UTC-4.
 */
const BOLIVIA_TIME = new Intl.DateTimeFormat("es-BO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/La_Paz",
});

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return BOLIVIA_TIME.format(date);
}
