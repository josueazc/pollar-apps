/**
 * Standalone draw verifier — for sceptics.
 *
 *   node scripts/verify-draw.mjs <proof.json>
 *   node scripts/verify-draw.mjs                # defaults to scripts/out/draw-proof.json
 *
 * This file deliberately imports NOTHING from the app. It re-implements the
 * draw from the published rules and talks straight to public Horizon, so
 * running it proves the app did not put a thumb on the scale. Copy it
 * anywhere, point it at a raffle's published proof, and check for yourself.
 *
 * What it takes on faith from the proof: only the DECLARED INPUTS — the draw
 * time and the list of sold ticket numbers, both of which the raffle page
 * publishes before the draw. Everything else is re-derived.
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HORIZON = "https://horizon-testnet.stellar.org";
const here = dirname(fileURLToPath(import.meta.url));

async function get(path) {
  const res = await fetch(`${HORIZON}${path}`);
  if (!res.ok) throw new Error(`Horizon ${res.status} on ${path}`);
  return res.json();
}

/** First ledger closed at or after `target` (ms), by binary search on close time. */
async function firstLedgerAtOrAfter(target) {
  const newest = (await get("/ledgers?order=desc&limit=1"))._embedded.records[0];
  if (Date.parse(newest.closed_at) < target) {
    throw new Error("Draw time is in the future — no deciding ledger exists yet.");
  }
  const oldest = (await get("/ledgers?order=asc&limit=1"))._embedded.records[0];
  if (Date.parse(oldest.closed_at) >= target) return oldest;

  let lo = oldest.sequence;
  let hi = newest.sequence;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const l = await get(`/ledgers/${mid}`);
    if (Date.parse(l.closed_at) >= target) hi = mid;
    else lo = mid;
  }
  return get(`/ledgers/${hi}`);
}

const proofPath = process.argv[2] ?? join(here, "out", "draw-proof.json");
const proof = JSON.parse(await readFile(proofPath, "utf8"));

console.log("── Independent draw verification ────────────────────────");
console.log(`proof file : ${proofPath}`);
console.log();
console.log("Declared inputs (published before the draw):");
console.log(`  draw time    : ${proof.drawTime}`);
console.log(`  sold tickets : ${proof.soldTickets.join(", ")}`);
console.log();

const target = Date.parse(proof.drawTime);
const failures = [];

function check(name, ok, detail) {
  console.log(`  ${ok ? "✓" : "✗"} ${name}`);
  if (detail) console.log(`      ${detail}`);
  if (!ok) failures.push(name);
}

// 1. Re-derive the deciding ledger from Horizon.
const ledger = await firstLedgerAtOrAfter(target);
console.log("Re-derived from Horizon:");
console.log(`  ledger    : ${ledger.sequence}`);
console.log(`  closed_at : ${ledger.closed_at}`);
console.log(`  hash      : ${ledger.hash}`);
console.log();

console.log("Checks:");
check(
  "Deciding ledger matches the one in the proof",
  ledger.sequence === proof.ledger.sequence,
  `proof says ${proof.ledger.sequence}, Horizon says ${ledger.sequence}`
);
check(
  "Ledger hash matches the one in the proof",
  ledger.hash === proof.ledger.hash
);

// 2. The boundary property: the ledger before it must have closed BEFORE the
//    draw time. This is what makes "first at or after" unambiguous, and it is
//    the check that catches a cherry-picked ledger.
const previous = await get(`/ledgers/${ledger.sequence - 1}`);
check(
  "It really is the FIRST such ledger (predecessor closed earlier)",
  Date.parse(previous.closed_at) < target,
  `ledger ${previous.sequence} closed ${previous.closed_at}, before ${proof.drawTime}`
);
check(
  "The deciding ledger closed at or after the draw time",
  Date.parse(ledger.closed_at) >= target,
  `ledger ${ledger.sequence} closed ${ledger.closed_at}`
);

// 3. Recompute the winner.
const ordered = [...proof.soldTickets].sort((a, b) => a - b);
check(
  "Sold tickets were ordered ascending",
  ordered.join(",") === proof.soldTickets.join(",")
);

const n = BigInt(`0x${ledger.hash}`);
const index = Number(n % BigInt(ordered.length));
const winner = ordered[index];

console.log();
console.log("Recomputation:");
console.log(`  n     = ${n}`);
console.log(`  index = n mod ${ordered.length} = ${index}`);
console.log(`  sold[${index}] = ${winner}`);
console.log();
console.log("Checks:");
check("Winning index matches the proof", index === proof.winningIndex,
  `proof says ${proof.winningIndex}, recomputed ${index}`);
check("Winning number matches the proof", winner === proof.winningNumber,
  `proof says #${proof.winningNumber}, recomputed #${winner}`);

console.log();
if (failures.length === 0) {
  console.log(`✓ VERIFIED — ticket #${winner} won, and the public data proves it.`);
  process.exit(0);
} else {
  console.log(`✗ VERIFICATION FAILED (${failures.length}): ${failures.join("; ")}`);
  process.exit(1);
}
