/**
 * Raffle domain rules — ticket references, reservations, and status.
 *
 * The one external constraint that shapes this file: a Stellar text memo holds
 * at most 28 BYTES. The ticket reference has to fit in there, because the memo
 * is what ties an incoming payment to the number it was meant to buy.
 */

/** Stellar's hard limit for a `text` memo. */
export const MEMO_MAX_BYTES = 28;

/** How long a picked number is held while its payment is in flight. */
export const RESERVATION_MINUTES = 15;

/** Characters used for raffle ids: no vowels (no accidental words), no 0/O/1/I. */
const ID_ALPHABET = "23456789BCDFGHJKLMNPQRSTVWXYZ";

/** Short, URL-safe, human-readable raffle id. */
export function newRaffleId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
}

/**
 * The payment reference for a ticket, e.g. `RH-K7M2QX9B-0042`.
 *
 * It carries the raffle id so a payment can be matched without knowing which
 * raffle it belongs to, and the number so the match is unambiguous. Both parts
 * are recoverable, which is what lets the Horizon backstop poller assign a
 * ticket from nothing but an on-chain memo.
 */
export function ticketReference(raffleId: string, number: number): string {
  const ref = `RH-${raffleId}-${String(number).padStart(4, "0")}`;
  if (new TextEncoder().encode(ref).length > MEMO_MAX_BYTES) {
    throw new Error(
      `Ticket reference "${ref}" exceeds the ${MEMO_MAX_BYTES}-byte Stellar memo limit.`
    );
  }
  return ref;
}

/** Parse a reference back out of a memo. Returns null for anything unrelated. */
export function parseReference(
  memo: string | null | undefined
): { raffleId: string; number: number } | null {
  if (!memo) return null;
  const match = /^RH-([A-Z0-9]+)-(\d{1,4})$/.exec(memo.trim());
  if (!match) return null;
  return { raffleId: match[1], number: Number(match[2]) };
}

export type TicketStatus = "free" | "reserved" | "sold";

/**
 * Everything the buyer's client needs to pay for a held number.
 *
 * Shared by the reserve route and the buy sheet on purpose. These two used to
 * describe the same object independently — the server called the field `memo`,
 * the client read `reference` — so the client silently sent `undefined` as the
 * Stellar memo and posted to `/api/tickets/undefined/confirm`. One type means
 * that mismatch is a compile error rather than a runtime shrug.
 */
export interface PaymentInstruction {
  /** Goes in the Stellar memo; the only link between payment and number. */
  reference: string;
  recipient: string;
  amount: string;
  assetCode: string;
  assetIssuer: string | null;
  expiresAt: string;
}

export interface Raffle {
  id: string;
  prizeName: string;
  prizeDescription: string;
  prizeImageUrl: string | null;
  ticketPrice: string;
  assetCode: string;
  assetIssuer: string | null;
  numberCount: number;
  drawTime: string;
  organizerAddress: string;
  organizerName: string;
  createdAt: string;
  salesClosedAt: string | null;
}

export interface Ticket {
  id: string;
  raffleId: string;
  number: number;
  status: "reserved" | "sold";
  reference: string;
  buyerAddress: string | null;
  amount: string | null;
  txHash: string | null;
  reservedAt: string;
  expiresAt: string;
  paidAt: string | null;
}

/** A reservation is dead once its window has passed; the number is free again. */
export function isExpired(ticket: Ticket, now = new Date()): boolean {
  return ticket.status === "reserved" && Date.parse(ticket.expiresAt) <= now.getTime();
}

/** Whether the raffle still accepts payments. */
export function salesOpen(raffle: Raffle, now = new Date()): boolean {
  if (raffle.salesClosedAt) return false;
  return now.getTime() < Date.parse(raffle.drawTime);
}

/** Whether the draw may run: the announced time has arrived and sales are shut. */
export function drawable(raffle: Raffle, now = new Date()): boolean {
  return now.getTime() >= Date.parse(raffle.drawTime);
}

/**
 * Validate a raffle before it is created. Returns the list of problems, empty
 * when the input is good.
 */
export function validateRaffleInput(input: {
  prizeName?: unknown;
  ticketPrice?: unknown;
  numberCount?: unknown;
  drawTime?: unknown;
}): string[] {
  const errors: string[] = [];

  if (typeof input.prizeName !== "string" || input.prizeName.trim().length === 0) {
    errors.push("The prize needs a name.");
  }

  const price = Number(input.ticketPrice);
  if (!Number.isFinite(price) || price <= 0) {
    errors.push("The ticket price must be greater than zero.");
  }

  const count = Number(input.numberCount);
  if (!Number.isInteger(count) || count < 2 || count > 9999) {
    // 9999 is not arbitrary: the reference pads the number to 4 digits so it
    // fits the memo, so five-digit raffles could not be referenced on-chain.
    errors.push("The raffle needs between 2 and 9999 numbers.");
  }

  const draw = Date.parse(String(input.drawTime));
  if (Number.isNaN(draw)) {
    errors.push("The draw date is not a valid date.");
  } else if (draw <= Date.now()) {
    errors.push("The draw date must be in the future.");
  }

  return errors;
}
