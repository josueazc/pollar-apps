/**
 * Spike 1a — payment verification against real Stellar testnet data.
 *
 *   node --experimental-strip-types scripts/spike-verify-payment.ts
 *
 * Pins the trust boundary: a transaction hash reported by a buyer's browser is
 * only a claim. This exercises `verifyPayment` against a REAL testnet payment
 * and then, holding that transaction fixed, walks every way the claim could be
 * wrong — wrong memo, wrong amount, wrong recipient, wrong asset, malformed
 * hash, unknown transaction — and asserts each one is refused.
 */

import { verifyPayment, type ExpectedPayment } from "../lib/horizon.ts";

// A real, successful testnet payment with a text memo.
const REAL = {
  hash: "7e5bc1870fbd3b2357613d21ca26501276b6f090088d6424c481fd31fae78cd3",
  to: "GBDFQPA2G4672RNGMQWQA2LHIP7BJ4PTYYFLGT3P5PO7VE6FBXAGA3CM",
  amount: "6.0000000",
  memo: "note 5",
};

const correct: ExpectedPayment = {
  reference: REAL.memo,
  organizerAddress: REAL.to,
  amount: REAL.amount,
  assetCode: "XLM",
  assetIssuer: null,
};

let passed = 0;
let failed = 0;

async function expectAccepted(name: string, expected: ExpectedPayment, hash = REAL.hash) {
  const result = await verifyPayment(hash, expected);
  const ok = result.ok;
  console.log(`  ${ok ? "✓" : "✗"} ${name}`);
  if (!ok) console.log(`      rejected: ${result.reason}`);
  if (ok) passed++;
  else failed++;
  return result;
}

async function expectRejected(name: string, expected: ExpectedPayment, hash = REAL.hash) {
  const result = await verifyPayment(hash, expected);
  const ok = !result.ok;
  console.log(`  ${ok ? "✓" : "✗"} ${name}`);
  if (result.ok) console.log("      ACCEPTED a payment it should have refused");
  else console.log(`      reason: ${result.reason}`);
  if (ok) passed++;
  else failed++;
}

console.log("── Spike 1a: payment verification ───────────────────────");
console.log(`real tx : ${REAL.hash.slice(0, 24)}…`);
console.log(`memo    : "${REAL.memo}"  amount: ${REAL.amount} XLM`);
console.log();

console.log("Accepts the genuine payment:");
const good = await expectAccepted("correct reference, recipient, amount and asset", correct);
if (good.ok) {
  console.log(`      from ${good.payment.from.slice(0, 8)}…  ledger ${good.payment.ledger}`);
}
console.log();

console.log("Refuses every mismatched claim:");
await expectRejected("memo belongs to a different ticket", {
  ...correct,
  reference: "RH-K7M2QX9B-0042",
});
await expectRejected("amount lower than the ticket price", { ...correct, amount: "5.0000000" });
await expectRejected("amount higher than the ticket price", { ...correct, amount: "6.0000001" });
await expectRejected("payment went to somebody else's account", {
  ...correct,
  organizerAddress: "GC62QHGDTEXT2D6WMOIB2OX4PC6KP7RRBK7GSHMKY7EWZ5K3XWZUVBVO",
});
await expectRejected("asset is not the one the raffle prices in", {
  ...correct,
  assetCode: "USDC",
  assetIssuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
});
await expectRejected("hash is not a Stellar hash at all", correct, "not-a-hash");
await expectRejected(
  "hash is well-formed but no such transaction",
  correct,
  "0000000000000000000000000000000000000000000000000000000000000000"
);

console.log();
console.log(`${passed} passed, ${failed} failed`);
console.log(failed === 0 ? "✓ SPIKE 1a PASSED" : "✗ SPIKE 1a FAILED");
process.exit(failed === 0 ? 0 : 1);
