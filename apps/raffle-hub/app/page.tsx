"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LoginButton } from "@/components/LoginButton";
import { BalanceCard } from "@/components/BalanceCard";
import { SendModal } from "@/components/SendModal";
import { ReceiveModal } from "@/components/ReceiveModal";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { usePollarAuth } from "@/hooks/usePollarAuth";
import { formatDateTime } from "@/lib/format";
import type { Raffle } from "@/lib/raffle";

export default function Home() {
  const { user } = usePollarAuth();
  const [raffles, setRaffles] = useState<Raffle[] | null>(null);
  const [wallet, setWallet] = useState<"send" | "receive" | null>(null);

  useEffect(() => {
    fetch("/api/raffles", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setRaffles(data.raffles ?? []))
      .catch(() => setRaffles([]));
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-5 pb-16 sm:p-8">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold sm:text-4xl">Raffle Hub</h1>
          <p className="text-sm text-muted">
            Rifas donde el sorteo se puede comprobar. Pagás tu número, y el ganador sale de
            datos públicos que nadie puede acomodar.
          </p>
        </div>
        <LoginButton />
      </header>

      {user && (
        <section className="flex flex-col gap-3">
          <BalanceCard />
          {/*
            Buying a number costs USDC, so a buyer whose wallet is empty needs a
            way to put some in — Receive shows the address to fund, Send moves it
            on. Both are the template's own flows; the raffle screens simply had
            nowhere to reach them from.
          */}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setWallet("receive")}>
              Receive
            </Button>
            <Button variant="secondary" onClick={() => setWallet("send")}>
              Send
            </Button>
          </div>
        </section>
      )}

      <Link href="/create">
        <Button className="w-full sm:w-auto">Start a raffle</Button>
      </Link>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Raffles</h2>

        {raffles === null && (
          <div className="flex items-center gap-3 px-1 py-6 text-sm text-muted">
            <Spinner size={18} /> Loading…
          </div>
        )}

        {raffles?.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface px-5 py-10 text-center">
            <span className="text-3xl">🎟️</span>
            <p className="text-sm text-muted">
              No raffles yet. Start one and share the QR.
            </p>
          </div>
        )}

        <ul className="flex flex-col gap-2">
          {raffles?.map((raffle) => (
            <li key={raffle.id}>
              <Link
                href={`/r/${raffle.id}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-border bg-surface px-4 py-3.5 transition-colors hover:bg-surface-hover"
              >
                <span className="font-semibold">{raffle.prizeName}</span>
                <span className="font-mono text-xs text-muted">{raffle.id}</span>
                <span className="ml-auto font-mono text-sm">
                  {raffle.ticketPrice} {raffle.assetCode}
                </span>
                <span className="w-full text-xs text-muted">
                  {raffle.numberCount} numbers · draws {formatDateTime(raffle.drawTime)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <SendModal open={wallet === "send"} onClose={() => setWallet(null)} />
      <ReceiveModal open={wallet === "receive"} onClose={() => setWallet(null)} />
    </main>
  );
}
