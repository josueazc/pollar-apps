"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { LoginButton } from "@/components/LoginButton";
import { TicketGrid, GridLegend } from "@/components/TicketGrid";
import { BuyTicketModal } from "@/components/BuyTicketModal";
import { DrawProofCard } from "@/components/DrawProof";
import { Button } from "@/components/ui/Button";
import { usePollarAuth } from "@/hooks/usePollarAuth";
import { formatDateTime } from "@/lib/format";
import type { RaffleView } from "@/lib/view";

/** How often the page re-reads state while sales are open. */
const POLL_MS = 8000;

/**
 * The interactive raffle board, hydrated on top of server-rendered state.
 *
 * `initial` already contains everything, so there is no loading spinner and no
 * fetch-on-mount: the first paint is the real board. Polling only refreshes
 * what is already on screen.
 */
export function RaffleBoard({
  initial,
  initialPick,
  origin,
}: {
  initial: RaffleView;
  initialPick: number | null;
  /** Absolute base URL, resolved server-side so the QR codes hydrate cleanly. */
  origin: string;
}) {
  const { user } = usePollarAuth();

  const [view, setView] = useState(initial);
  const [picked, setPicked] = useState<number | null>(initialPick);
  const [drawing, setDrawing] = useState(false);
  const [drawError, setDrawError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/raffles/${initial.raffle.id}`, { cache: "no-store" });
    if (res.ok) setView(await res.json());
  }, [initial.raffle.id]);

  // While sales are open, refresh the grid and run the backstop reconciler so
  // payments whose buyer never reported a hash still land on the board.
  useEffect(() => {
    if (!view.salesOpen) return;
    const timer = setInterval(() => {
      void fetch(`/api/raffles/${initial.raffle.id}/reconcile`, { method: "POST" })
        .catch(() => null)
        .then(() => refresh());
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [view.salesOpen, initial.raffle.id, refresh]);

  async function runDraw() {
    setDrawing(true);
    setDrawError(null);
    const res = await fetch(`/api/raffles/${initial.raffle.id}/draw`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) setDrawError(data.error ?? "The draw could not run.");
    await refresh();
    setDrawing(false);
  }

  const { raffle, draw } = view;
  const isOrganizer = user?.address === raffle.organizerAddress;
  const shareUrl = `${origin}/r/${raffle.id}`;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-5 pb-16 sm:p-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Raffle {raffle.id}
          </span>
          <h1 className="text-2xl font-bold sm:text-3xl">{raffle.prizeName}</h1>
          {raffle.organizerName && (
            <p className="text-sm text-muted">Run by {raffle.organizerName}</p>
          )}
        </div>
        <LoginButton />
      </header>

      {raffle.prizeDescription && (
        <p className="text-sm leading-relaxed text-muted">{raffle.prizeDescription}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Ticket" value={`${raffle.ticketPrice} ${raffle.assetCode}`} />
        <Stat label="Sold" value={`${view.soldCount} / ${raffle.numberCount}`} />
        <Stat
          label={draw ? "Drawn" : "Draws"}
          value={formatDateTime(raffle.drawTime)}
        />
      </div>

      {draw ? (
        <DrawProofCard proof={draw.proof} winnerAddress={draw.winnerAddress} />
      ) : (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">Pick your number</h2>
            {!view.salesOpen && (
              <span className="text-xs font-semibold text-warning">Sales closed</span>
            )}
          </div>
          <TicketGrid grid={view.grid} onPick={setPicked} disabled={!view.salesOpen} />
          <GridLegend soldCount={view.soldCount} total={raffle.numberCount} />
        </section>
      )}

      {!draw && view.drawable && (
        <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm">
            The draw time has arrived.{" "}
            {view.soldCount === 0
              ? "No numbers were sold, so there is nothing to draw."
              : "Anyone can run it — the result is fixed by the ledger, not by who clicks."}
          </p>
          {view.soldCount > 0 && (
            <Button onClick={() => void runDraw()} loading={drawing}>
              {drawing ? "Reading the ledger…" : "Run the draw"}
            </Button>
          )}
          {drawError && (
            <p className="rounded-xl border border-error-border bg-error-light px-3 py-2 text-sm text-error">
              {drawError}
            </p>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Share this raffle</h2>
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-5 sm:flex-row sm:items-center">
          <div className="rounded-xl bg-white p-3">
            <QRCode value={shareUrl} size={116} />
          </div>
          <div className="flex min-w-0 flex-col gap-1 text-center sm:text-left">
            <p className="text-sm text-muted">
              Anyone can scan this and see the board — no account needed to look.
            </p>
            <code className="truncate rounded-lg bg-background px-2 py-1 font-mono text-xs">
              {shareUrl}
            </code>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Sales</h2>
        {view.history.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
            No numbers sold yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {view.history.map((sale) => (
              <li
                key={sale.txHash}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-surface px-4 py-3 text-sm"
              >
                <span className="font-mono font-bold">#{sale.number}</span>
                <span className="font-mono text-xs text-muted">
                  {sale.buyer ? `${sale.buyer.slice(0, 4)}…${sale.buyer.slice(-4)}` : "—"}
                </span>
                <span className="font-mono text-xs">
                  {sale.amount} {raffle.assetCode}
                </span>
                <span className="text-xs text-muted">
                  {formatDateTime(sale.paidAt)}
                </span>
                {sale.explorer && (
                  <a
                    href={sale.explorer}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto font-mono text-xs text-primary underline underline-offset-2"
                  >
                    {sale.txHash!.slice(0, 8)}… ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isOrganizer && (
        <p className="rounded-xl border border-border bg-surface px-4 py-3 text-xs text-muted">
          You run this raffle. Ticket payments land straight in your Pollar account — this app
          never holds them. Handing the prize to the winner is on you.
        </p>
      )}

      <BuyTicketModal
        raffle={raffle}
        number={picked}
        origin={origin}
        open={picked !== null}
        onClose={() => setPicked(null)}
        onSold={() => void refresh()}
      />
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border border-border bg-surface px-4 py-3">
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <span className="font-mono text-sm font-semibold">{value}</span>
    </div>
  );
}
