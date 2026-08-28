"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoginButton } from "@/components/LoginButton";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useBalance } from "@/hooks/useBalance";
import { usePollarAuth } from "@/hooks/usePollarAuth";
import { paymentAssetFrom, currencyOf } from "@/lib/payments";

/** Default draw time: a week out, which is how long these things usually run. */
function defaultDrawTime(): string {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  d.setSeconds(0, 0);
  // datetime-local wants local time without a zone suffix.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CreateRafflePage() {
  const router = useRouter();
  const { user, login } = usePollarAuth();
  const { asset } = useBalance();

  const [prizeName, setPrizeName] = useState("");
  const [prizeDescription, setPrizeDescription] = useState("");
  const [organizerName, setOrganizerName] = useState("");
  const [ticketPrice, setTicketPrice] = useState("1");
  const [numberCount, setNumberCount] = useState("50");
  const [drawTime, setDrawTime] = useState(defaultDrawTime());
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);

  const payAsset = paymentAssetFrom(asset);
  const currency = currencyOf(payAsset);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;

    // A ref, not the `saving` state: setState is asynchronous, so between the
    // first click and the re-render that disables the button there is a window
    // where a second submit gets through. That window is not theoretical — it
    // produced two identical raffles a second apart during testing. A ref flips
    // synchronously and closes it.
    if (submitting.current) return;
    submitting.current = true;

    setSaving(true);
    setErrors([]);

    const res = await fetch("/api/raffles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prizeName,
        prizeDescription,
        organizerName,
        ticketPrice,
        numberCount: Number(numberCount),
        // datetime-local has no zone; the browser's own zone is the honest read.
        drawTime: new Date(drawTime).toISOString(),
        assetCode: currency,
        assetIssuer: payAsset.type === "native" ? null : payAsset.issuer,
        // Straight from the session: ticket money must land in the organizer's
        // own account, so this is never something anyone types.
        organizerAddress: user.address,
      }),
    });

    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      // Released only on failure: on success the page navigates away, and
      // re-opening the gate would just invite a duplicate on the way out.
      submitting.current = false;
      setErrors(data.errors ?? ["The raffle could not be created."]);
      return;
    }
    router.push(`/r/${data.raffle.id}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 p-5 pb-16 sm:p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Start a raffle</h1>
          <p className="text-sm text-muted">
            Numbers are paid straight to your Pollar account.
          </p>
        </div>
        <LoginButton />
      </header>

      {!user ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-5 py-10 text-center">
          <span className="text-3xl">🎟️</span>
          <p className="text-sm text-muted">
            Log in first — the raffle needs an account for the ticket money to land in.
          </p>
          <Button onClick={login}>Log in with Pollar</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Input
            label="Prize"
            placeholder="Canasta navideña"
            value={prizeName}
            onChange={(e) => setPrizeName(e.target.value)}
            required
          />

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Description</span>
            <textarea
              value={prizeDescription}
              onChange={(e) => setPrizeDescription(e.target.value)}
              rows={3}
              placeholder="What exactly does the winner get?"
              className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-primary"
            />
          </label>

          <Input
            label="Your name (shown on the raffle)"
            placeholder="Doña Marta"
            value={organizerName}
            onChange={(e) => setOrganizerName(e.target.value)}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={`Price per number (${currency})`}
              type="number"
              min="0.0000001"
              step="0.0000001"
              value={ticketPrice}
              onChange={(e) => setTicketPrice(e.target.value)}
              required
            />
            <Input
              label="How many numbers"
              type="number"
              min="2"
              max="9999"
              value={numberCount}
              onChange={(e) => setNumberCount(e.target.value)}
              required
            />
          </div>

          <Input
            label="Draw date and time"
            type="datetime-local"
            value={drawTime}
            onChange={(e) => setDrawTime(e.target.value)}
            required
          />

          <p className="rounded-xl border border-border bg-surface px-4 py-3 text-xs leading-relaxed text-muted">
            At that moment the winner is decided by the first Stellar ledger to close — a number
            nobody can steer, not even you. The raffle page publishes the proof so anyone can
            check it.
          </p>

          {errors.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-xl border border-error-border bg-error-light px-4 py-3 text-sm text-error">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}

          <Button type="submit" loading={saving}>
            {saving ? "Creating…" : "Create raffle"}
          </Button>
        </form>
      )}
    </main>
  );
}
