import { NextResponse } from "next/server";
import { getDraw, getRaffle, gridFor, listTickets } from "@/lib/store";
import { explorerTx } from "@/lib/horizon";
import { isExpired, salesOpen, drawable } from "@/lib/raffle";

/**
 * Everything the public raffle page needs, in one call and without a session.
 * Deliberately readable by anyone: the grid and the proof are the point.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const raffle = await getRaffle(id);
  if (!raffle) {
    return NextResponse.json({ error: "No raffle with that code." }, { status: 404 });
  }

  const [grid, tickets, draw] = await Promise.all([
    gridFor(raffle),
    listTickets(raffle.id),
    getDraw(raffle.id),
  ]);

  const sold = tickets.filter((t) => t.status === "sold");

  return NextResponse.json({
    raffle,
    grid,
    salesOpen: salesOpen(raffle),
    drawable: drawable(raffle),
    soldCount: sold.length,
    reservedCount: tickets.filter((t) => t.status === "reserved" && !isExpired(t)).length,
    // Buyer addresses are already public on-chain; this is the sale history the
    // brief asks to be verifiable in the explorer.
    history: sold
      .slice()
      .sort((a, b) => (a.paidAt ?? "").localeCompare(b.paidAt ?? ""))
      .map((t) => ({
        number: t.number,
        buyer: t.buyerAddress,
        amount: t.amount,
        paidAt: t.paidAt,
        txHash: t.txHash,
        explorer: t.txHash ? explorerTx(t.txHash) : null,
      })),
    draw,
  });
}
