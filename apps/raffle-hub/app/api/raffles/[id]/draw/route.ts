import { NextResponse } from "next/server";
import { closeSales, getDraw, getRaffle, listTickets, recordDraw } from "@/lib/store";
import { drawable } from "@/lib/raffle";
import { runDraw } from "@/lib/draw.mjs";

/**
 * Execute the draw and publish the proof.
 *
 * The result is not chosen here — it is *computed* from a ledger hash nobody
 * controls. This route only decides WHEN to look, and refuses to look early:
 * before the announced time there is no ledger yet, which is precisely what
 * stops an organizer from re-rolling until a friend wins.
 *
 * It is also write-once. A second call returns the first result rather than
 * drawing again.
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

  const existing = await getDraw(raffle.id);
  if (existing) {
    return NextResponse.json({ draw: existing, alreadyDrawn: true });
  }

  if (!drawable(raffle)) {
    return NextResponse.json(
      {
        error: `This raffle draws at ${raffle.drawTime}. The deciding ledger does not exist yet.`,
      },
      { status: 409 }
    );
  }

  const tickets = await listTickets(raffle.id);
  const sold = tickets.filter((t) => t.status === "sold");
  if (sold.length === 0) {
    return NextResponse.json(
      { error: "Nobody bought a ticket, so there is nothing to draw." },
      { status: 409 }
    );
  }

  // No more numbers can be sold once the outcome is determined.
  await closeSales(raffle.id);

  let proof;
  try {
    proof = await runDraw(raffle.drawTime, sold.map((t) => t.number));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "The draw could not be computed." },
      { status: 502 }
    );
  }

  const winner = sold.find((t) => t.number === proof.winningNumber) ?? null;

  const draw = await recordDraw({
    raffleId: raffle.id,
    winningNumber: proof.winningNumber,
    winnerAddress: winner?.buyerAddress ?? null,
    proof,
  });

  return NextResponse.json({ draw });
}
