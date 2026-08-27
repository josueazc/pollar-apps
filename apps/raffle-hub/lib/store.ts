import type { Row } from "@libsql/client";
import { db } from "./db";
import {
  RESERVATION_MINUTES,
  isExpired,
  newRaffleId,
  ticketReference,
  type Raffle,
  type Ticket,
  type TicketStatus,
} from "./raffle";

function toRaffle(row: Row): Raffle {
  return {
    id: row.id as string,
    prizeName: row.prize_name as string,
    prizeDescription: row.prize_description as string,
    prizeImageUrl: (row.prize_image_url as string | null) ?? null,
    ticketPrice: row.ticket_price as string,
    assetCode: row.asset_code as string,
    assetIssuer: (row.asset_issuer as string | null) ?? null,
    numberCount: Number(row.number_count),
    drawTime: row.draw_time as string,
    organizerAddress: row.organizer_address as string,
    organizerName: row.organizer_name as string,
    createdAt: row.created_at as string,
    salesClosedAt: (row.sales_closed_at as string | null) ?? null,
  };
}

function toTicket(row: Row): Ticket {
  return {
    id: row.id as string,
    raffleId: row.raffle_id as string,
    number: Number(row.number),
    status: row.status as "reserved" | "sold",
    reference: row.reference as string,
    buyerAddress: (row.buyer_address as string | null) ?? null,
    amount: (row.amount as string | null) ?? null,
    txHash: (row.tx_hash as string | null) ?? null,
    reservedAt: row.reserved_at as string,
    expiresAt: row.expires_at as string,
    paidAt: (row.paid_at as string | null) ?? null,
  };
}

export async function createRaffle(input: {
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
}): Promise<Raffle> {
  const client = await db();
  const id = newRaffleId();
  const createdAt = new Date().toISOString();

  await client.execute({
    sql: `INSERT INTO raffles (
            id, prize_name, prize_description, prize_image_url, ticket_price,
            asset_code, asset_issuer, number_count, draw_time,
            organizer_address, organizer_name, created_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      id,
      input.prizeName,
      input.prizeDescription,
      input.prizeImageUrl,
      input.ticketPrice,
      input.assetCode,
      input.assetIssuer,
      input.numberCount,
      new Date(input.drawTime).toISOString(),
      input.organizerAddress,
      input.organizerName,
      createdAt,
    ],
  });

  return (await getRaffle(id))!;
}

export async function getRaffle(id: string): Promise<Raffle | null> {
  const client = await db();
  const result = await client.execute({
    sql: "SELECT * FROM raffles WHERE id = ?",
    args: [id],
  });
  return result.rows[0] ? toRaffle(result.rows[0]) : null;
}

export async function listRaffles(): Promise<Raffle[]> {
  const client = await db();
  const result = await client.execute("SELECT * FROM raffles ORDER BY created_at DESC");
  return result.rows.map(toRaffle);
}

/**
 * Drop reservations whose window has closed, freeing their numbers.
 *
 * Deleting rather than flagging is deliberate: the UNIQUE(raffle_id, number)
 * constraint is what prevents double-selling, so an expired reservation has to
 * leave the table for the number to be pickable again. Nothing is lost — a
 * reservation that was never paid has no history worth keeping.
 *
 * Called lazily before any read or write that depends on which numbers are
 * free, which keeps expiry correct without a background job.
 */
export async function sweepExpired(raffleId: string): Promise<number> {
  const client = await db();
  const result = await client.execute({
    sql: `DELETE FROM tickets
          WHERE raffle_id = ? AND status = 'reserved' AND expires_at <= ?`,
    args: [raffleId, new Date().toISOString()],
  });
  return result.rowsAffected;
}

export async function listTickets(raffleId: string): Promise<Ticket[]> {
  await sweepExpired(raffleId);
  const client = await db();
  const result = await client.execute({
    sql: "SELECT * FROM tickets WHERE raffle_id = ? ORDER BY number ASC",
    args: [raffleId],
  });
  return result.rows.map(toTicket);
}

/** Status of every number in the raffle, for the grid. */
export async function gridFor(raffle: Raffle): Promise<TicketStatus[]> {
  const tickets = await listTickets(raffle.id);
  const grid: TicketStatus[] = new Array(raffle.numberCount).fill("free");
  for (const ticket of tickets) {
    if (ticket.number >= 1 && ticket.number <= raffle.numberCount) {
      grid[ticket.number - 1] = isExpired(ticket) ? "free" : ticket.status;
    }
  }
  return grid;
}

export type ReserveResult =
  | { ok: true; ticket: Ticket }
  | { ok: false; reason: string };

/**
 * Hold a number for a buyer while they pay.
 *
 * Concurrency is handled by the database, not by checking first and writing
 * after: the INSERT either wins the UNIQUE(raffle_id, number) race or it does
 * not. Two phones tapping number 7 at the same instant cannot both get it.
 */
export async function reserveNumber(
  raffle: Raffle,
  number: number,
  buyerAddress: string | null
): Promise<ReserveResult> {
  if (!Number.isInteger(number) || number < 1 || number > raffle.numberCount) {
    return { ok: false, reason: `Number ${number} is not part of this raffle.` };
  }

  await sweepExpired(raffle.id);

  const client = await db();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESERVATION_MINUTES * 60_000);
  const id = crypto.randomUUID();
  const reference = ticketReference(raffle.id, number);

  try {
    await client.execute({
      sql: `INSERT INTO tickets (
              id, raffle_id, number, status, reference, buyer_address,
              amount, reserved_at, expires_at
            ) VALUES (?,?,?, 'reserved', ?,?,?,?,?)`,
      args: [
        id,
        raffle.id,
        number,
        reference,
        buyerAddress,
        raffle.ticketPrice,
        now.toISOString(),
        expiresAt.toISOString(),
      ],
    });
  } catch {
    // The only way this INSERT fails is the uniqueness guard, i.e. somebody
    // already holds or owns the number.
    const existing = await client.execute({
      sql: "SELECT * FROM tickets WHERE raffle_id = ? AND number = ?",
      args: [raffle.id, number],
    });
    const taken = existing.rows[0] ? toTicket(existing.rows[0]) : null;
    return {
      ok: false,
      reason:
        taken?.status === "sold"
          ? `Number ${number} is already sold.`
          : `Number ${number} is being paid for right now. Try another, or come back in a few minutes.`,
    };
  }

  const created = await client.execute({
    sql: "SELECT * FROM tickets WHERE id = ?",
    args: [id],
  });
  return { ok: true, ticket: toTicket(created.rows[0]) };
}

export async function getTicketByReference(reference: string): Promise<Ticket | null> {
  const client = await db();
  const result = await client.execute({
    sql: "SELECT * FROM tickets WHERE reference = ?",
    args: [reference],
  });
  return result.rows[0] ? toTicket(result.rows[0]) : null;
}

/**
 * Turn a reserved ticket into a sold one, against a verified payment.
 *
 * The caller must have confirmed the payment on-chain first — this function
 * records, it does not judge. The tx hash is unique across the table, so the
 * same payment can never buy two tickets.
 */
export async function markSold(
  reference: string,
  payment: { txHash: string; from: string; amount: string; createdAt: string }
): Promise<Ticket | null> {
  const client = await db();
  await client.execute({
    sql: `UPDATE tickets
          SET status = 'sold', tx_hash = ?, buyer_address = ?, amount = ?, paid_at = ?
          WHERE reference = ? AND status = 'reserved'`,
    args: [payment.txHash, payment.from, payment.amount, payment.createdAt, reference],
  });
  return getTicketByReference(reference);
}

/**
 * Re-create a reservation for a payment that arrived without one.
 *
 * The backstop path: a buyer paid with the right memo but their reservation had
 * already expired (slow payment, closed tab). The money is on-chain and the
 * memo says which number it was for, so the ticket is honoured as long as the
 * number has not since been sold to somebody else.
 */
export async function claimForLatePayment(
  raffle: Raffle,
  number: number,
  payment: { txHash: string; from: string; amount: string; createdAt: string }
): Promise<{ ok: boolean; reason?: string; ticket?: Ticket }> {
  const client = await db();
  const reference = ticketReference(raffle.id, number);

  const existing = await getTicketByReference(reference);
  if (existing?.status === "sold") {
    return existing.txHash === payment.txHash
      ? { ok: true, ticket: existing }
      : { ok: false, reason: `Number ${number} had already been sold to someone else.` };
  }

  if (!existing) {
    try {
      await client.execute({
        sql: `INSERT INTO tickets (
                id, raffle_id, number, status, reference, buyer_address,
                amount, tx_hash, reserved_at, expires_at, paid_at
              ) VALUES (?,?,?, 'sold', ?,?,?,?,?,?,?)`,
        args: [
          crypto.randomUUID(),
          raffle.id,
          number,
          reference,
          payment.from,
          payment.amount,
          payment.txHash,
          payment.createdAt,
          payment.createdAt,
          payment.createdAt,
        ],
      });
    } catch {
      return { ok: false, reason: `Number ${number} was taken in the meantime.` };
    }
    return { ok: true, ticket: (await getTicketByReference(reference))! };
  }

  const ticket = await markSold(reference, payment);
  return { ok: true, ticket: ticket ?? undefined };
}

export async function closeSales(raffleId: string): Promise<void> {
  const client = await db();
  await client.execute({
    sql: "UPDATE raffles SET sales_closed_at = ? WHERE id = ? AND sales_closed_at IS NULL",
    args: [new Date().toISOString(), raffleId],
  });
}

export interface StoredDraw {
  raffleId: string;
  drawnAt: string;
  winningNumber: number;
  winnerAddress: string | null;
  proof: unknown;
}

export async function getDraw(raffleId: string): Promise<StoredDraw | null> {
  const client = await db();
  const result = await client.execute({
    sql: "SELECT * FROM draws WHERE raffle_id = ?",
    args: [raffleId],
  });
  const row = result.rows[0];
  if (!row) return null;
  return {
    raffleId: row.raffle_id as string,
    drawnAt: row.drawn_at as string,
    winningNumber: Number(row.winning_number),
    winnerAddress: (row.winner_address as string | null) ?? null,
    proof: JSON.parse(row.proof as string),
  };
}

/**
 * Publish the draw. Fails if this raffle was already drawn — a result that
 * could be overwritten would make the published proof meaningless.
 */
export async function recordDraw(draw: {
  raffleId: string;
  winningNumber: number;
  winnerAddress: string | null;
  proof: unknown;
}): Promise<StoredDraw> {
  const client = await db();
  await client.execute({
    sql: `INSERT INTO draws (raffle_id, drawn_at, winning_number, winner_address, proof)
          VALUES (?,?,?,?,?)`,
    args: [
      draw.raffleId,
      new Date().toISOString(),
      draw.winningNumber,
      draw.winnerAddress,
      JSON.stringify(draw.proof),
    ],
  });
  return (await getDraw(draw.raffleId))!;
}
