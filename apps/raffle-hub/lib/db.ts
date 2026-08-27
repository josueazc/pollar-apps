import { createClient, type Client } from "@libsql/client";

/**
 * Persistence: libSQL.
 *
 * Local development and a fresh clone get a plain SQLite file with zero setup,
 * which is what keeps the "pnpm install && pnpm dev with only the Pollar key in
 * .env" promise honest. A deployment (Vercel, where the filesystem is
 * ephemeral) points at a hosted libSQL/Turso database through the two optional
 * env vars below; nothing else changes.
 */
const url = process.env.TURSO_DATABASE_URL ?? "file:./raffle-hub.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

const globalDb = globalThis as { __raffleDb?: Client; __raffleDbReady?: Promise<void> };

function client(): Client {
  globalDb.__raffleDb ??= createClient({ url, authToken });
  return globalDb.__raffleDb;
}

/**
 * Schema, applied once per process. Idempotent, so it doubles as the migration
 * path for a fresh clone: the first request creates the tables.
 */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS raffles (
    id                TEXT PRIMARY KEY,
    prize_name        TEXT NOT NULL,
    prize_description TEXT NOT NULL DEFAULT '',
    prize_image_url   TEXT,
    ticket_price      TEXT NOT NULL,
    asset_code        TEXT NOT NULL,
    asset_issuer      TEXT,
    number_count      INTEGER NOT NULL,
    draw_time         TEXT NOT NULL,
    organizer_address TEXT NOT NULL,
    organizer_name    TEXT NOT NULL DEFAULT '',
    created_at        TEXT NOT NULL,
    sales_closed_at   TEXT
  )`,

  /*
   * One row per number the moment it is picked. `status` is the whole ticket
   * lifecycle: 'reserved' while a payment is pending, 'sold' once the payment
   * is confirmed on-chain, and the row is deleted when a reservation expires
   * (which frees the number again).
   *
   * The UNIQUE constraint on (raffle_id, number) is what makes "one number, one
   * buyer" a database invariant rather than an application hope: two people
   * racing for the same number means one INSERT fails.
   */
  `CREATE TABLE IF NOT EXISTS tickets (
    id            TEXT PRIMARY KEY,
    raffle_id     TEXT NOT NULL REFERENCES raffles(id),
    number        INTEGER NOT NULL,
    status        TEXT NOT NULL CHECK (status IN ('reserved','sold')),
    reference     TEXT NOT NULL,
    buyer_address TEXT,
    amount        TEXT,
    tx_hash       TEXT,
    reserved_at   TEXT NOT NULL,
    expires_at    TEXT NOT NULL,
    paid_at       TEXT,
    UNIQUE (raffle_id, number)
  )`,

  `CREATE UNIQUE INDEX IF NOT EXISTS tickets_reference ON tickets (reference)`,
  `CREATE INDEX IF NOT EXISTS tickets_by_raffle ON tickets (raffle_id, status)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tickets_tx_hash ON tickets (tx_hash) WHERE tx_hash IS NOT NULL`,

  /*
   * The published draw. One row per raffle, written once: a draw that could be
   * overwritten would defeat the point of publishing a proof, so the insert is
   * guarded by the primary key rather than upserted.
   */
  `CREATE TABLE IF NOT EXISTS draws (
    raffle_id      TEXT PRIMARY KEY REFERENCES raffles(id),
    drawn_at       TEXT NOT NULL,
    winning_number INTEGER NOT NULL,
    winner_address TEXT,
    proof          TEXT NOT NULL
  )`,
];

async function migrate(): Promise<void> {
  const db = client();
  for (const statement of SCHEMA) {
    await db.execute(statement);
  }
}

/** The database handle, with the schema guaranteed to exist. */
export async function db(): Promise<Client> {
  globalDb.__raffleDbReady ??= migrate();
  await globalDb.__raffleDbReady;
  return client();
}
