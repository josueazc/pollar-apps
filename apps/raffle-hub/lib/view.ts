import { getDraw, getRaffle, gridFor, listTickets } from "./store";
import { explorerTx } from "./horizon";
import { drawable, isExpired, salesOpen, type Raffle, type TicketStatus } from "./raffle";
import type { DrawProof } from "./draw.mjs";

export interface Sale {
  number: number;
  buyer: string | null;
  amount: string | null;
  paidAt: string | null;
  txHash: string | null;
  explorer: string | null;
}

export interface RaffleView {
  raffle: Raffle;
  grid: TicketStatus[];
  salesOpen: boolean;
  drawable: boolean;
  soldCount: number;
  reservedCount: number;
  history: Sale[];
  draw: {
    winningNumber: number;
    winnerAddress: string | null;
    proof: DrawProof;
  } | null;
}

/**
 * Everything the public raffle page shows, assembled once.
 *
 * Shared by the server-rendered page and the JSON route so the two can never
 * drift into disagreeing about the same raffle.
 */
export async function loadRaffleView(id: string): Promise<RaffleView | null> {
  const raffle = await getRaffle(id);
  if (!raffle) return null;

  const [grid, tickets, draw] = await Promise.all([
    gridFor(raffle),
    listTickets(raffle.id),
    getDraw(raffle.id),
  ]);

  const sold = tickets.filter((t) => t.status === "sold");

  return {
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
    draw: draw
      ? {
          winningNumber: draw.winningNumber,
          winnerAddress: draw.winnerAddress,
          proof: draw.proof as DrawProof,
        }
      : null,
  };
}
