import { NextResponse } from "next/server";
import { getRaffle, getTicketByReference, markSold } from "@/lib/store";
import { verifyPayment } from "@/lib/horizon";
import { paymentsAccepted } from "@/lib/raffle";

/**
 * The buyer's browser reports the hash it got back from the Pollar SDK.
 *
 * This is the fast path — the ticket flips to sold within a second of paying,
 * with no polling. But the hash is a CLAIM from an untrusted client, so it is
 * checked against Horizon before anything is written: right memo, right
 * recipient, right amount, right asset, actually successful. A client that
 * lies gets a 422 and the reservation simply runs out.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ reference: string }> }
) {
  const { reference } = await params;
  const ticket = await getTicketByReference(decodeURIComponent(reference));
  if (!ticket) {
    return NextResponse.json(
      { error: "That reservation has expired or never existed." },
      { status: 404 }
    );
  }

  // Idempotent: the client may retry, and a paid ticket stays paid.
  if (ticket.status === "sold") {
    return NextResponse.json({ ticket, alreadyConfirmed: true });
  }

  const raffle = await getRaffle(ticket.raffleId);
  if (!raffle) {
    return NextResponse.json({ error: "No raffle with that code." }, { status: 404 });
  }

  // Payments stop counting at drawTime, not at "has the draw run yet". Once the
  // draw time passes the deciding ledger's hash is public, so anyone could work
  // out which extra number moves the winner onto a ticket of theirs and buy
  // exactly that one. See paymentsAccepted() in lib/raffle.ts.
  if (!paymentsAccepted(raffle)) {
    return NextResponse.json(
      {
        error:
          "Sales for this raffle closed at the draw time. Your payment arrived too late to become a ticket — contact the organizer.",
      },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => null);
  const txHash = String((body as { txHash?: unknown })?.txHash ?? "");

  const verification = await verifyPayment(txHash, {
    reference: ticket.reference,
    organizerAddress: raffle.organizerAddress,
    amount: raffle.ticketPrice,
    assetCode: raffle.assetCode,
    assetIssuer: raffle.assetIssuer,
  });

  if (!verification.ok) {
    return NextResponse.json(
      { error: verification.reason, retryable: verification.retryable },
      { status: verification.retryable ? 202 : 422 }
    );
  }

  const sold = await markSold(ticket.reference, verification.payment);
  return NextResponse.json({ ticket: sold, payment: verification.payment });
}
