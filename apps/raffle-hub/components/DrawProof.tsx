"use client";

import { useState } from "react";
import type { DrawProof as Proof } from "@/lib/draw.mjs";

/**
 * The proof, laid out so a stranger can follow it.
 *
 * The whole point of the mechanism is that nobody has to trust this app, so the
 * card shows every input, the arithmetic, and links straight to the network's
 * own copy of the ledger. If the numbers here disagree with the explorer, the
 * explorer is right and the raffle is a fraud — and that is exactly the check a
 * reader should be able to make.
 */
export function DrawProofCard({
  proof,
  winnerAddress,
}: {
  proof: Proof;
  winnerAddress: string | null;
}) {
  const [showMath, setShowMath] = useState(false);
  const n = BigInt(`0x${proof.ledger.hash}`);

  return (
    <div className="flex flex-col gap-5 rounded-2xl border-2 border-primary bg-primary-light p-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">Winner</span>
        <span className="font-mono text-5xl font-bold text-primary">
          #{proof.winningNumber}
        </span>
        {winnerAddress && (
          <span className="font-mono text-xs text-muted">
            {winnerAddress.slice(0, 6)}…{winnerAddress.slice(-6)}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4">
        <p className="text-sm text-muted">
          The winner was not picked by anyone. It comes from the hash of the first Stellar
          ledger that closed at or after the announced draw time — a number published by the
          network, that nobody, the organizer included, can steer.
        </p>

        <dl className="flex flex-col gap-2 text-xs">
          <Row label="Announced draw time" value={proof.drawTime} mono />
          <Row label="Deciding ledger" value={String(proof.ledger.sequence)} mono />
          <Row label="Ledger closed at" value={proof.ledger.closedAt} mono />
          <div className="flex flex-col gap-1">
            <dt className="text-muted">Ledger hash</dt>
            <dd className="break-all rounded-lg bg-surface px-2 py-1.5 font-mono text-[0.7rem] leading-relaxed">
              {proof.ledger.hash}
            </dd>
          </div>
          <Row
            label="Tickets sold"
            value={`${proof.soldCount} — ${proof.soldTickets.join(", ")}`}
          />
        </dl>

        <button
          type="button"
          onClick={() => setShowMath((v) => !v)}
          className="self-start text-xs font-semibold text-primary underline underline-offset-2"
        >
          {showMath ? "Hide the arithmetic" : "Show the arithmetic"}
        </button>

        {showMath && (
          <div className="flex flex-col gap-2 rounded-lg bg-surface p-3 font-mono text-[0.7rem] leading-relaxed">
            <span className="break-all text-muted">n = 0x{proof.ledger.hash}</span>
            <span className="break-all">n = {n.toString()}</span>
            <span>
              index = n mod {proof.soldCount} ={" "}
              <strong className="text-primary">{proof.winningIndex}</strong>
            </span>
            <span>
              sold[{proof.winningIndex}] of [{proof.soldTickets.join(", ")}] ={" "}
              <strong className="text-primary">#{proof.winningNumber}</strong>
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-3 text-xs font-semibold">
          <a
            href={proof.ledger.explorer}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            Check the ledger on the explorer ↗
          </a>
          <a
            href={proof.ledger.horizon}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            Raw ledger from Horizon ↗
          </a>
        </div>
      </div>

      <p className="text-center text-xs text-muted">
        Re-run it yourself:{" "}
        <code className="rounded bg-surface px-1.5 py-0.5 font-mono">
          node scripts/verify-draw.mjs
        </code>
      </p>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={`text-right ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
