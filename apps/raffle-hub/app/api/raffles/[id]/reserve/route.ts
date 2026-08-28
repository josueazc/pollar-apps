import { NextResponse } from "next/server";
import { getRaffle, reserveNumber } from "@/lib/store";
import { salesOpen, type PaymentInstruction } from "@/lib/raffle";

/**
 * Hold a number while the buyer pays.
 *
 * Returns the reference the payment must carry in its memo. That reference is
 * the only link between an on-chain payment and the number it bought, so the
 * client puts it in the memo and the server later looks for exactly it.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const raffle = await getRaffle(id);
  if (!raffle) {
    return NextResponse.json({ error: "No raffle with that code." }, { status: 404 });
  }
  if (!salesOpen(raffle)) {
    return NextResponse.json(
      { error: "Sales are closed for this raffle." },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => null);
  const number = Number((body as { number?: unknown })?.number);
  const buyerAddress = (body as { buyerAddress?: unknown })?.buyerAddress;

  const result = await reserveNumber(
    raffle,
    number,
    typeof buyerAddress === "string" ? buyerAddress : null
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }

  const payment: PaymentInstruction = {
    reference: result.ticket.reference,
    recipient: raffle.organizerAddress,
    amount: raffle.ticketPrice,
    assetCode: raffle.assetCode,
    assetIssuer: raffle.assetIssuer,
    expiresAt: result.ticket.expiresAt,
  };

  return NextResponse.json({ ticket: result.ticket, payment });
}
