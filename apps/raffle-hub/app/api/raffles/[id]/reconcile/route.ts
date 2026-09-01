import { NextResponse } from "next/server";
import {
  claimForLatePayment,
  getRaffle,
  getTicketByReference,
  markSold,
} from "@/lib/store";
import { recentPaymentsTo } from "@/lib/horizon";
import { parseReference, paymentsAccepted } from "@/lib/raffle";

/**
 * The backstop: find paid tickets whose buyer never reported the hash.
 *
 * Some buyers close the tab, lose signal, or run out of battery between
 * confirming the payment and the app hearing about it. Their money still
 * arrived at the organizer's account with the ticket reference in the memo, so
 * this reads the organizer's incoming payments straight from Horizon and
 * assigns whatever it can match.
 *
 * Limits, stated plainly because they matter:
 *  - It only sees the last N payments (default 50). A very busy organizer could
 *    push an old unmatched payment out of that window.
 *  - It runs when something calls it — the raffle page polls it while sales are
 *    open — so there are no webhooks and detection is not instant.
 *  - A payment with a missing or wrong memo cannot be attributed to a number at
 *    all. Those are reported here as `unmatched` for the organizer to settle
 *    off-app, since the app never holds funds and cannot refund.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const raffle = await getRaffle(id);
  if (!raffle) {
    return NextResponse.json({ error: "No raffle with that code." }, { status: 404 });
  }

  // This route is public and the page polls it, so it is the easiest way to get
  // a ticket minted. It must therefore honour the same cutoff as everything
  // else: once the draw time passes the deciding ledger's hash is public, and
  // assigning any further ticket would let somebody choose the winner after
  // seeing it. See paymentsAccepted() in lib/raffle.ts.
  if (!paymentsAccepted(raffle)) {
    const late = await recentPaymentsTo(raffle.organizerAddress);
    return NextResponse.json({
      scanned: late.length,
      assigned: [],
      closed: true,
      // Still reported, so the organizer can see money that arrived too late
      // and settle it off-app. It just cannot buy a number any more.
      unmatched: late
        .filter((p) => parseReference(p.memo)?.raffleId === raffle.id)
        .map((p) => ({
          txHash: p.txHash,
          memo: p.memo,
          amount: p.amount,
          reason: "Arrived after the draw time, when the outcome was already public.",
        })),
    });
  }

  const payments = await recentPaymentsTo(raffle.organizerAddress);

  const assigned: Array<{ number: number; txHash: string }> = [];
  const unmatched: Array<{ txHash: string; memo: string; amount: string; reason: string }> = [];

  for (const payment of payments) {
    const parsed = parseReference(payment.memo);

    if (!parsed || parsed.raffleId !== raffle.id) {
      // Not for this raffle — could be another raffle or unrelated traffic.
      continue;
    }

    if (payment.assetCode !== raffle.assetCode) {
      unmatched.push({
        txHash: payment.txHash,
        memo: payment.memo,
        amount: payment.amount,
        reason: `Paid in ${payment.assetCode}, but tickets cost ${raffle.assetCode}.`,
      });
      continue;
    }

    if (Number(payment.amount).toFixed(7) !== Number(raffle.ticketPrice).toFixed(7)) {
      unmatched.push({
        txHash: payment.txHash,
        memo: payment.memo,
        amount: payment.amount,
        reason: `Paid ${payment.amount}, but a ticket costs ${raffle.ticketPrice}.`,
      });
      continue;
    }

    const existing = await getTicketByReference(payment.memo);
    if (existing?.status === "sold") continue; // already handled by the fast path

    if (existing) {
      await markSold(payment.memo, payment);
      assigned.push({ number: parsed.number, txHash: payment.txHash });
      continue;
    }

    // The reservation had already expired; honour the payment if the number is
    // still available.
    const claim = await claimForLatePayment(raffle, parsed.number, payment);
    if (claim.ok) {
      assigned.push({ number: parsed.number, txHash: payment.txHash });
    } else {
      unmatched.push({
        txHash: payment.txHash,
        memo: payment.memo,
        amount: payment.amount,
        reason: claim.reason ?? "Could not be assigned.",
      });
    }
  }

  return NextResponse.json({
    scanned: payments.length,
    assigned,
    unmatched,
  });
}
