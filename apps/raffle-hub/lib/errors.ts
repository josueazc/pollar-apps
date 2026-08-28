/**
 * Turn whatever an API handed back into something safe to render.
 *
 * This exists because of a real crash: the Pollar SDK returns `details` as a
 * validation OBJECT (`{ code, errors, path, message }`), not a string. Putting
 * it straight into React state and rendering it threw "Objects are not valid as
 * a React child" and took the whole page down — so a payment that merely failed
 * looked to the buyer like the app was broken.
 *
 * An error path has to be the most defensive code in the file: it runs exactly
 * when something has already gone wrong, and it must never become the second
 * failure.
 */
export function errorText(value: unknown, depth = 0): string {
  if (depth > 4) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((entry) => errorText(entry, depth + 1))
      .filter(Boolean)
      .join(" · ");
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    // Zod-style validation errors: the useful part is the message, and the path
    // says which field was wrong.
    if (typeof record.message === "string" && record.message.trim()) {
      const path = Array.isArray(record.path) ? record.path.join(".") : "";
      return path ? `${path}: ${record.message}` : record.message;
    }
    if (record.errors) return errorText(record.errors, depth + 1);
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return "";
}

/** First readable message among several candidates, or the fallback. */
export function firstError(candidates: unknown[], fallback: string): string {
  for (const candidate of candidates) {
    const text = errorText(candidate);
    if (text) return text;
  }
  return fallback;
}
