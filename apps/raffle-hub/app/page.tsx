"use client";

import { useState } from "react";
import manifest from "@/pollar.manifest.json";
import { BalanceCard } from "@/components/BalanceCard";
import { LoginButton } from "@/components/LoginButton";
import { ReceiveModal } from "@/components/ReceiveModal";
import { SendModal } from "@/components/SendModal";
import { PollarLogo } from "@/components/ui/PollarLogo";
import { usePollarAuth } from "@/hooks/usePollarAuth";

const APP_NAME = manifest.name || "My Pollar App";

/**
 * Wallet-style demo of everything the template ships with: auth, balance,
 * and the send/receive flows. Replace this page with your app's screens.
 */
export default function Home() {
  const { user } = usePollarAuth();
  const [sendOpen, setSendOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);

  if (!user) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12">
        <div className="flex flex-col items-center gap-5 text-center">
          <PollarLogo size={104} />
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            {APP_NAME}
            <span className="block text-primary">pay with Pollar</span>
          </h1>
          <p className="max-w-sm text-lg leading-8 text-muted">
            Log in to get a wallet and start paying inside this app. No
            crypto knowledge needed.
          </p>
        </div>
        <LoginButton />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6 lg:max-w-lg lg:py-10">
      <header className="flex items-center justify-between gap-3 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <PollarLogo size={30} />
          {/* App name stays off phones; the logo carries the brand there. */}
          <h1 className="hidden min-w-0 truncate text-xl font-bold tracking-tight sm:block">
            {APP_NAME}
          </h1>
        </div>
        <LoginButton />
      </header>

      <BalanceCard />

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setSendOpen(true)}
          className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-sm transition-all duration-150 hover:bg-primary-hover active:scale-[0.97]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 19V5m0 0l-6 6m6-6l6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Send
        </button>
        <button
          onClick={() => setReceiveOpen(true)}
          className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-background text-base font-semibold text-primary shadow-sm transition-all duration-150 hover:border-primary/50 hover:bg-primary-light active:scale-[0.97]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14m0 0l6-6m-6 6l-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Receive
        </button>
      </div>

      <SendModal open={sendOpen} onClose={() => setSendOpen(false)} />
      <ReceiveModal open={receiveOpen} onClose={() => setReceiveOpen(false)} />

      <p className="mt-auto pt-4 text-center text-xs text-muted-light">
        Demo page. Build your app starting from{" "}
        <code className="font-mono">app/page.tsx</code>
      </p>
    </main>
  );
}
