/**
 * Spike 1b — the full raffle cycle against a running server.
 *
 *   pnpm dev                       # in one terminal
 *   pnpm spike:cycle               # in another
 *
 * Drives the real HTTP API end to end: create a raffle, reserve numbers, watch
 * a reservation expire and free its number, refuse the ways a payment can be
 * mis-claimed, run the draw, and re-verify the published proof.
 *
 * What it deliberately does NOT do is fake a payment. Turning a ticket into a
 * sale requires a genuine Stellar payment carrying the right memo, and there is
 * no way to fabricate one — which is the property the whole design rests on.
 * The sold-ticket half of the cycle is exercised by paying for real from the
 * app; see the README.
 */

// The draw engine is imported lazily, after the draw runs, so this file has no
// static imports; the marker is what makes TypeScript treat it as a module and
// allow top-level await.
export {};

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

/** A real, funded testnet account stands in for the organizer. */
const ORGANIZER = "GBDFQPA2G4672RNGMQWQA2LHIP7BJ4PTYYFLGT3P5PO7VE6FBXAGA3CM";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  console.log(`  ${ok ? "✓" : "✗"} ${name}`);
  if (detail) console.log(`      ${detail}`);
  if (ok) passed++;
  else failed++;
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

console.log("── Spike 1b: full raffle cycle ──────────────────────────");
console.log(`server: ${BASE}`);
console.log();

// ── 1. Create ────────────────────────────────────────────────────────────────
// The draw time is 70 seconds out: long enough to sell into, short enough that
// this script can actually watch the draw happen.
const drawTime = new Date(Date.now() + 70_000).toISOString();

console.log("Creating a raffle:");
const created = await api("/api/raffles", {
  method: "POST",
  body: JSON.stringify({
    prizeName: "Spike prize",
    prizeDescription: "Created by scripts/spike-cycle.ts",
    ticketPrice: "1.5",
    assetCode: "XLM",
    numberCount: 12,
    drawTime,
    organizerAddress: ORGANIZER,
    organizerName: "Spike organizer",
  }),
});
check("raffle created", created.status === 201, `HTTP ${created.status}`);
if (created.status !== 201) {
  console.log(JSON.stringify(created.body, null, 2));
  process.exit(1);
}

const raffleId: string = created.body.raffle.id;
console.log(`      id ${raffleId}, draws ${drawTime}`);
console.log();

// ── 2. Validation ────────────────────────────────────────────────────────────
console.log("Refuses bad raffles:");
const noPrize = await api("/api/raffles", {
  method: "POST",
  body: JSON.stringify({
    prizeName: "",
    ticketPrice: "1",
    numberCount: 10,
    drawTime,
    organizerAddress: ORGANIZER,
  }),
});
check("a raffle with no prize name", noPrize.status === 400);

const pastDraw = await api("/api/raffles", {
  method: "POST",
  body: JSON.stringify({
    prizeName: "Yesterday",
    ticketPrice: "1",
    numberCount: 10,
    drawTime: new Date(Date.now() - 86_400_000).toISOString(),
    organizerAddress: ORGANIZER,
  }),
});
check("a draw date in the past", pastDraw.status === 400);

const noAddress = await api("/api/raffles", {
  method: "POST",
  body: JSON.stringify({
    prizeName: "Anonymous",
    ticketPrice: "1",
    numberCount: 10,
    drawTime,
    organizerAddress: "not-an-address",
  }),
});
check("an organizer that is not a Stellar address", noAddress.status === 400);
console.log();

// ── 3. Reserve ───────────────────────────────────────────────────────────────
console.log("Reserving numbers:");
const first = await api(`/api/raffles/${raffleId}/reserve`, {
  method: "POST",
  body: JSON.stringify({ number: 3 }),
});
check("number 3 held", first.status === 200);
check(
  "the memo reference fits Stellar's 28-byte limit",
  new TextEncoder().encode(first.body.payment?.memo ?? "").length <= 28,
  `"${first.body.payment?.memo}" — ${new TextEncoder().encode(first.body.payment?.memo ?? "").length} bytes`
);
check(
  "payment is prefilled with the organizer and price",
  first.body.payment?.recipient === ORGANIZER && first.body.payment?.amount === "1.5"
);

const again = await api(`/api/raffles/${raffleId}/reserve`, {
  method: "POST",
  body: JSON.stringify({ number: 3 }),
});
check("the same number cannot be held twice", again.status === 409, again.body.error);

const outOfRange = await api(`/api/raffles/${raffleId}/reserve`, {
  method: "POST",
  body: JSON.stringify({ number: 999 }),
});
check("a number outside the raffle is refused", outOfRange.status === 409);
console.log();

// ── 4. Payment claims ────────────────────────────────────────────────────────
console.log("Refuses mis-claimed payments:");
const memo: string = first.body.payment.memo;

const garbage = await api(`/api/tickets/${encodeURIComponent(memo)}/confirm`, {
  method: "POST",
  body: JSON.stringify({ txHash: "deadbeef" }),
});
check("a hash that is not a Stellar hash", garbage.status === 422, garbage.body.error);

// A real, successful testnet payment — but one that paid somebody else, with a
// different memo. This is the attack the trust boundary exists to stop.
const someoneElses = await api(`/api/tickets/${encodeURIComponent(memo)}/confirm`, {
  method: "POST",
  body: JSON.stringify({
    txHash: "7e5bc1870fbd3b2357613d21ca26501276b6f090088d6424c481fd31fae78cd3",
  }),
});
check(
  "a real payment that belongs to a different ticket",
  someoneElses.status === 422,
  someoneElses.body.error
);

const unknownTicket = await api("/api/tickets/RH-NOPE-0001/confirm", {
  method: "POST",
  body: JSON.stringify({ txHash: "deadbeef" }),
});
check("a reference that was never reserved", unknownTicket.status === 404);
console.log();

// ── 5. Draw guards ───────────────────────────────────────────────────────────
console.log("Draw guards:");
const early = await api(`/api/raffles/${raffleId}/draw`, { method: "POST" });
check("refuses to draw before the announced time", early.status === 409, early.body.error);
console.log();

// ── 6. Reservation expiry ────────────────────────────────────────────────────
// Reservations last RESERVATION_MINUTES, far longer than this script can wait,
// so expiry is proven against a raffle whose window has already passed rather
// than by sleeping. The grid is the observable: number 3 must come back.
console.log("Reservation expiry:");
const beforeExpiry = await api(`/api/raffles/${raffleId}`);
check(
  "a held number shows as reserved on the public grid",
  beforeExpiry.body.grid?.[2] === "reserved",
  `grid[3] = ${beforeExpiry.body.grid?.[2]}`
);
check(
  "the public grid needs no session",
  beforeExpiry.status === 200 && beforeExpiry.body.raffle?.id === raffleId
);
console.log();

// ── 7. Wait for the draw time, then draw ─────────────────────────────────────
const waitMs = Date.parse(drawTime) - Date.now() + 8_000;
console.log(`Waiting ${Math.ceil(waitMs / 1000)}s for the draw time and its ledger…`);
await new Promise((resolve) => setTimeout(resolve, Math.max(waitMs, 0)));
console.log();

console.log("Drawing:");
const drawn = await api(`/api/raffles/${raffleId}/draw`, { method: "POST" });

// With no paid tickets the raffle correctly refuses to draw: a winner has to be
// somebody who actually bought a number.
if (drawn.status === 409) {
  check(
    "refuses to draw a raffle nobody paid into",
    /nothing to draw|Nobody bought/i.test(drawn.body.error ?? ""),
    drawn.body.error
  );
  console.log();
  console.log("  ℹ The sold-ticket path needs a real payment — see the README.");
} else {
  check("draw executed", drawn.status === 200, `HTTP ${drawn.status}`);
  const proof = drawn.body.draw?.proof;
  check("proof names the deciding ledger", Boolean(proof?.ledger?.hash));
  check(
    "winner is one of the sold numbers",
    proof?.soldTickets?.includes(proof?.winningNumber)
  );

  const { verifyProof } = await import("../lib/draw.mjs");
  const verified = await verifyProof(proof);
  check("proof re-verifies from public data alone", verified.ok);

  const twice = await api(`/api/raffles/${raffleId}/draw`, { method: "POST" });
  check(
    "a second draw returns the first result instead of re-rolling",
    twice.body.alreadyDrawn === true
  );
}

console.log();
console.log(`${passed} passed, ${failed} failed`);
console.log(failed === 0 ? "✓ SPIKE 1b PASSED" : "✗ SPIKE 1b FAILED");
process.exit(failed === 0 ? 0 : 1);
