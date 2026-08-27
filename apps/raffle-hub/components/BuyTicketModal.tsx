"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { usePollar } from "@pollar/react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { usePollarAuth } from "@/hooks/usePollarAuth";
import type { PaymentAsset } from "@/lib/payments";
import type { Raffle } from "@/lib/raffle";

interface Reservation {
  reference: string;
  recipient: string;
  amount: string;
  assetCode: string;
  assetIssuer: string | null;
  expiresAt: string;
}

type Step =
  | { step: "reserving" }
  | { step: "ready"; reservation: Reservation }
  | { step: "paying"; reservation: Reservation }
  | { step: "confirming"; reservation: Reservation; txHash: string }
  | { step: "done"; number: number; txHash: string }
  | { step: "error"; message: string };

function useCountdown(expiresAt: string | null): string | null {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setLeft(Date.parse(expiresAt) - Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  if (left === null) return null;
  if (left <= 0) return "expired";
  const minutes = Math.floor(left / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Buy one number: reserve it, pay, get the ticket.
 *
 * The buyer never sees or types a G… address. Picking a number reserves it and
 * prefills the whole payment — recipient, amount, asset and the reference that
 * goes in the memo — so paying is one confirmation. The QR carries a link back
 * to this same flow, which is how somebody sitting at the table scans and pays
 * from their own phone.
 */
export function BuyTicketModal({
  raffle,
  number,
  origin,
  open,
  onClose,
  onSold,
}: {
  raffle: Raffle;
  number: number | null;
  /** Absolute base URL, resolved server-side so the QR hydrates cleanly. */
  origin: string;
  open: boolean;
  onClose: () => void;
  onSold: () => void;
}) {
  const { user, login, verified } = usePollarAuth();
  const { runTx } = usePollar();
  const [state, setState] = useState<Step>({ step: "reserving" });
  const reserving = useRef(false);

  const reservation = "reservation" in state ? state.reservation : null;
  const countdown = useCountdown(reservation?.expiresAt ?? null);

  // Reserve as soon as the modal opens for a number.
  useEffect(() => {
    if (!open || number === null || reserving.current) return;
    reserving.current = true;
    setState({ step: "reserving" });

    (async () => {
      try {
        const res = await fetch(`/api/raffles/${raffle.id}/reserve`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ number, buyerAddress: user?.address ?? null }),
        });
        const data = await res.json();
        if (!res.ok) {
          setState({ step: "error", message: data.error ?? "Could not hold that number." });
          return;
        }
        setState({ step: "ready", reservation: data.payment });
      } catch {
        setState({ step: "error", message: "Could not reach the raffle. Check your connection." });
      }
    })();
  }, [open, number, raffle.id, user?.address]);

  useEffect(() => {
    if (!open) reserving.current = false;
  }, [open]);

  const pay = useCallback(async () => {
    if (!reservation) return;
    setState({ step: "paying", reservation });

    const asset: PaymentAsset =
      reservation.assetCode === "XLM" || !reservation.assetIssuer
        ? { type: "native" }
        : {
            type: reservation.assetCode.length > 4 ? "credit_alphanum12" : "credit_alphanum4",
            code: reservation.assetCode,
            issuer: reservation.assetIssuer,
          };

    try {
      const result = await runTx(
        "payment",
        { destination: reservation.recipient, amount: reservation.amount, asset },
        // The reference travels in the memo. It is the only thing tying this
        // payment to the number being bought.
        { memo: { type: "text", value: reservation.reference } }
      );

      if (result.status === "error") {
        setState({
          step: "error",
          message: result.message ?? result.details ?? "The payment didn't go through.",
        });
        return;
      }

      setState({ step: "confirming", reservation, txHash: result.hash });

      // Report the hash so the ticket is assigned immediately. The server does
      // not trust it — it re-reads the payment from Horizon before assigning.
      const res = await fetch(
        `/api/tickets/${encodeURIComponent(reservation.reference)}/confirm`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ txHash: result.hash }),
        }
      );

      if (res.ok) {
        setState({ step: "done", number: number!, txHash: result.hash });
        onSold();
        return;
      }

      const data = await res.json();
      if (res.status === 202) {
        // Horizon has not ingested it yet. The payment is real and the backstop
        // reconciler will pick it up; say so rather than claiming failure.
        setState({ step: "done", number: number!, txHash: result.hash });
        onSold();
        return;
      }
      setState({ step: "error", message: data.error ?? "The payment could not be matched." });
    } catch (err) {
      setState({
        step: "error",
        message: err instanceof Error ? err.message : "The payment didn't go through.",
      });
    }
  }, [reservation, runTx, number, onSold]);

  const shareUrl = number === null ? "" : `${origin}/r/${raffle.id}?buy=${number}`;

  return (
    <Modal open={open} onClose={onClose} title={number === null ? "Ticket" : `Number ${number}`}>
      <div className="flex flex-col gap-5">
        {state.step === "reserving" && (
          <div className="flex items-center gap-3 py-8 text-sm text-muted">
            <Spinner size={18} /> Holding this number for you…
          </div>
        )}

        {state.step === "error" && (
          <>
            <p className="rounded-xl border border-error-border bg-error-light px-4 py-3 text-sm text-error">
              {state.message}
            </p>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </>
        )}

        {(state.step === "ready" || state.step === "paying") && reservation && (
          <>
            <div className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-4">
              <span className="text-xs uppercase tracking-wide text-muted">You pay</span>
              <span className="font-mono text-2xl font-bold">
                {reservation.amount} {reservation.assetCode}
              </span>
              <span className="text-sm text-muted">
                for number <span className="font-mono font-semibold text-foreground">{number}</span>{" "}
                in “{raffle.prizeName}”
              </span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <div className="rounded-2xl bg-white p-3">
                {shareUrl && <QRCode value={shareUrl} size={148} />}
              </div>
              <p className="max-w-[16rem] text-center text-xs text-muted">
                Paying from another phone? Scan this to open the same number there.
              </p>
            </div>

            <dl className="flex flex-col gap-1.5 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Reference (memo)</dt>
                <dd className="font-mono font-semibold">{reservation.reference}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Goes to</dt>
                <dd className="font-mono">
                  {raffle.organizerName || "organizer"} · {reservation.recipient.slice(0, 4)}…
                  {reservation.recipient.slice(-4)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Held for</dt>
                <dd className={countdown === "expired" ? "font-mono text-error" : "font-mono"}>
                  {countdown ?? "—"}
                </dd>
              </div>
            </dl>

            {!user ? (
              <Button onClick={login}>Log in to pay</Button>
            ) : (
              <Button
                onClick={() => void pay()}
                loading={state.step === "paying"}
                disabled={!verified || countdown === "expired"}
              >
                {countdown === "expired"
                  ? "Reservation expired"
                  : state.step === "paying"
                    ? "Paying…"
                    : `Pay ${reservation.amount} ${reservation.assetCode}`}
              </Button>
            )}
            <p className="text-center text-xs text-muted">
              The payment goes straight to the organizer. This app never holds your money.
            </p>
          </>
        )}

        {state.step === "confirming" && (
          <div className="flex items-center gap-3 py-8 text-sm text-muted">
            <Spinner size={18} /> Payment sent — confirming it on Stellar…
          </div>
        )}

        {state.step === "done" && (
          <>
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-success-border bg-success-light px-4 py-6 text-center">
              <span className="text-3xl">🎟️</span>
              <p className="font-semibold text-success">Number {state.number} is yours</p>
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${state.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-success underline underline-offset-2"
              >
                {state.txHash.slice(0, 12)}… ↗
              </a>
            </div>
            <Button onClick={onClose}>Done</Button>
          </>
        )}
      </div>
    </Modal>
  );
}
