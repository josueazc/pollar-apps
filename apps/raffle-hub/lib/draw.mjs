/**
 * Verifiable draw engine — Stellar testnet ledger hash.
 *
 * Zero dependencies on purpose: a third party must be able to audit and re-run
 * this file with nothing but Node and a network connection. It is the single
 * source of truth for the draw, imported by both the app and the standalone
 * verifier script.
 *
 * The mechanism, announced before any ticket is sold:
 *
 *   1. The raffle fixes `drawTime` (UTC) up front.
 *   2. The deciding ledger L is the FIRST Stellar ledger whose `closed_at` is
 *      at or after `drawTime`. Nobody controls which ledger that is, and it is
 *      not knowable in advance.
 *   3. n = L.hash read as a 256-bit big-endian unsigned integer.
 *   4. The sold tickets are ordered ascending by ticket number.
 *   5. index  = n mod soldTickets.length
 *      winner = soldTickets[index]
 *
 * Every input is public: the ledger hash is published by the network, and the
 * sold-ticket list is on the raffle page. Anyone can recompute the winner.
 */

const HORIZON = "https://horizon-testnet.stellar.org";

async function horizon(path) {
  const res = await fetch(`${HORIZON}${path}`);
  if (!res.ok) {
    throw new Error(`Horizon ${res.status} on ${path}: ${await res.text()}`);
  }
  return res.json();
}

/** The most recently closed ledger. */
export async function latestLedger() {
  const data = await horizon("/ledgers?order=desc&limit=1");
  return data._embedded.records[0];
}

/** A single ledger by sequence number. */
export async function ledgerBySequence(seq) {
  return horizon(`/ledgers/${seq}`);
}

/**
 * The first ledger closed at or after `drawTimeIso`.
 *
 * Horizon has no "ledger at time T" endpoint, so this binary-searches the
 * sequence range by `closed_at`. Ledger close times are strictly increasing,
 * which makes the search well defined and its result reproducible: any third
 * party running this against Horizon gets the same ledger.
 *
 * Throws if the draw time is still in the future — there is no deciding ledger
 * yet, and that is exactly the property that makes the outcome unmanipulable.
 */
export async function findDrawLedger(drawTimeIso) {
  const target = Date.parse(drawTimeIso);
  if (Number.isNaN(target)) {
    throw new Error(`Invalid draw time: ${drawTimeIso}`);
  }

  const newest = await latestLedger();
  if (Date.parse(newest.closed_at) < target) {
    throw new Error(
      `Draw time ${drawTimeIso} is in the future. The newest ledger (${newest.sequence}) closed at ${newest.closed_at}; no ledger has closed at or after the draw time yet.`
    );
  }

  // Horizon prunes old ledgers, so the reachable floor is the oldest ledger it
  // still serves rather than ledger 1.
  const oldestPage = await horizon("/ledgers?order=asc&limit=1");
  const oldest = oldestPage._embedded.records[0];
  if (Date.parse(oldest.closed_at) >= target) {
    // Draw time precedes everything Horizon retains; the floor IS the answer.
    return oldest;
  }

  let lo = oldest.sequence; // known: closed BEFORE target
  let hi = newest.sequence; // known: closed AT OR AFTER target

  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const ledger = await ledgerBySequence(mid);
    if (Date.parse(ledger.closed_at) >= target) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  return ledgerBySequence(hi);
}

/**
 * The winning index from a ledger hash and a ticket count.
 *
 * Pure and synchronous — this is the part a sceptic checks by hand. The hash is
 * 64 hex characters (256 bits), well beyond Number precision, so it goes
 * through BigInt.
 */
export function winningIndex(ledgerHash, soldCount) {
  if (!/^[0-9a-f]{64}$/i.test(ledgerHash)) {
    throw new Error(`Not a Stellar ledger hash: ${ledgerHash}`);
  }
  if (!Number.isInteger(soldCount) || soldCount < 1) {
    throw new Error(`Sold ticket count must be a positive integer, got ${soldCount}`);
  }
  const n = BigInt(`0x${ledgerHash}`);
  return Number(n % BigInt(soldCount));
}

/**
 * Run the draw and return the winner plus a self-contained proof.
 *
 * `soldTicketNumbers` is the list of numbers that were actually paid for. It is
 * sorted here so that the ordering is a property of the mechanism rather than
 * of whatever order the database happened to return.
 */
export async function runDraw(drawTimeIso, soldTicketNumbers) {
  if (!Array.isArray(soldTicketNumbers) || soldTicketNumbers.length === 0) {
    throw new Error("Cannot draw: no tickets were sold.");
  }
  const ordered = [...soldTicketNumbers].sort((a, b) => a - b);
  if (new Set(ordered).size !== ordered.length) {
    throw new Error("Cannot draw: duplicate ticket numbers.");
  }

  const ledger = await findDrawLedger(drawTimeIso);
  const index = winningIndex(ledger.hash, ordered.length);

  return {
    mechanism: "stellar-testnet-ledger-hash",
    drawTime: drawTimeIso,
    ledger: {
      sequence: ledger.sequence,
      hash: ledger.hash,
      closedAt: ledger.closed_at,
      explorer: `https://stellar.expert/explorer/testnet/ledger/${ledger.sequence}`,
      horizon: `${HORIZON}/ledgers/${ledger.sequence}`,
    },
    soldTickets: ordered,
    soldCount: ordered.length,
    winningIndex: index,
    winningNumber: ordered[index],
  };
}

/**
 * Recompute a published proof from scratch and report whether it holds.
 *
 * This is the third-party path: it trusts nothing in the proof except the
 * declared inputs (draw time and sold tickets), re-derives the ledger from
 * Horizon, and compares every claimed value.
 */
export async function verifyProof(proof) {
  const checks = [];
  const ordered = [...proof.soldTickets].sort((a, b) => a - b);

  const ledger = await findDrawLedger(proof.drawTime);
  checks.push({
    name: "Deciding ledger is the first closed at/after the draw time",
    expected: proof.ledger.sequence,
    actual: ledger.sequence,
    ok: ledger.sequence === proof.ledger.sequence,
  });
  checks.push({
    name: "Ledger hash matches what Horizon publishes",
    expected: proof.ledger.hash,
    actual: ledger.hash,
    ok: ledger.hash === proof.ledger.hash,
  });
  checks.push({
    name: "Sold tickets are in ascending order",
    expected: ordered.join(","),
    actual: proof.soldTickets.join(","),
    ok: ordered.join(",") === proof.soldTickets.join(","),
  });

  const index = winningIndex(ledger.hash, ordered.length);
  checks.push({
    name: "Winning index = ledgerHash mod soldCount",
    expected: proof.winningIndex,
    actual: index,
    ok: index === proof.winningIndex,
  });
  checks.push({
    name: "Winning number is the ticket at that index",
    expected: proof.winningNumber,
    actual: ordered[index],
    ok: ordered[index] === proof.winningNumber,
  });

  return { ok: checks.every((c) => c.ok), checks };
}
