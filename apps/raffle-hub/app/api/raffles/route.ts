import { NextResponse } from "next/server";
import { createRaffle, listRaffles } from "@/lib/store";
import { validateRaffleInput } from "@/lib/raffle";
import { looksLikeAddress } from "@/lib/payments";

export async function GET() {
  return NextResponse.json({ raffles: await listRaffles() });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ errors: ["Malformed request."] }, { status: 400 });
  }

  const errors = validateRaffleInput(body);

  // The organizer's address comes from their Pollar session on the client, not
  // from anything typed in. Payments land here, so a wrong value would send
  // every ticket sale to a stranger.
  if (!looksLikeAddress(String(body.organizerAddress ?? ""))) {
    errors.push("Log in before creating a raffle so tickets can be paid to your account.");
  }

  if (errors.length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  const raffle = await createRaffle({
    prizeName: String(body.prizeName).trim(),
    prizeDescription: String(body.prizeDescription ?? "").trim(),
    prizeImageUrl: body.prizeImageUrl ? String(body.prizeImageUrl).trim() : null,
    ticketPrice: String(body.ticketPrice),
    assetCode: String(body.assetCode ?? "XLM"),
    assetIssuer: body.assetIssuer ? String(body.assetIssuer) : null,
    numberCount: Number(body.numberCount),
    drawTime: String(body.drawTime),
    organizerAddress: String(body.organizerAddress),
    organizerName: String(body.organizerName ?? "").trim(),
  });

  return NextResponse.json({ raffle }, { status: 201 });
}
