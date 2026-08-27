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
