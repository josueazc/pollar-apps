/**
 * Spike 2 — verifiable draw, end to end against real Stellar testnet data.
 *
 *   node scripts/spike-draw.mjs [drawTimeIso] [ticketNumbers]
 *
 * With no arguments it draws for 10 minutes ago (so a deciding ledger exists)
 * over 5 sold tickets. Writes the proof to scripts/out/draw-proof.json so the
 * verifier can be pointed at it.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runDraw, verifyProof } from "../lib/draw.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const drawTime =
  process.argv[2] ?? new Date(Date.now() - 10 * 60 * 1000).toISOString();
const soldTickets = process.argv[3]
  ? process.argv[3].split(",").map((n) => Number(n.trim()))
  : [7, 12, 23, 41, 88];

console.log("── Spike 2: verifiable draw ─────────────────────────────");
console.log(`draw time   : ${drawTime}`);
console.log(`sold tickets: ${soldTickets.join(", ")} (${soldTickets.length} sold)`);
console.log();

const proof = await runDraw(drawTime, soldTickets);

console.log("Deciding ledger (first closed at/after the draw time):");
console.log(`  sequence  : ${proof.ledger.sequence}`);
console.log(`  closed_at : ${proof.ledger.closedAt}`);
console.log(`  hash      : ${proof.ledger.hash}`);
console.log(`  explorer  : ${proof.ledger.explorer}`);
console.log();

const n = BigInt(`0x${proof.ledger.hash}`);
console.log("Computation:");
console.log(`  n = 0x${proof.ledger.hash}`);
console.log(`    = ${n}`);
console.log(`  index = n mod ${proof.soldCount} = ${proof.winningIndex}`);
console.log(`  sold[${proof.winningIndex}] = ${proof.winningNumber}`);
console.log();
console.log(`>>> WINNER: ticket #${proof.winningNumber}`);
console.log();

const outDir = join(here, "out");
await mkdir(outDir, { recursive: true });
const outFile = join(outDir, "draw-proof.json");
await writeFile(outFile, `${JSON.stringify(proof, null, 2)}\n`);
console.log(`proof written to ${outFile}`);
console.log();

console.log("Re-verifying the proof from public data alone…");
const result = await verifyProof(proof);
for (const c of result.checks) {
  console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}`);
  if (!c.ok) console.log(`      expected ${c.expected}, got ${c.actual}`);
}
console.log();
console.log(result.ok ? "✓ SPIKE 2 PASSED" : "✗ SPIKE 2 FAILED");
process.exit(result.ok ? 0 : 1);
