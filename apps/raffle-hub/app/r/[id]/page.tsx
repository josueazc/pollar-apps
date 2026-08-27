import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { RaffleBoard } from "@/components/RaffleBoard";
import { loadRaffleView } from "@/lib/view";

/**
 * The public raffle page.
 *
 * Server-rendered on purpose: this is the link and the QR that get passed
 * around, so the board has to be there on first paint for someone who is not
 * logged in and may never log in. The interactive parts hydrate on top.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const view = await loadRaffleView(id);
  if (!view) return { title: "Raffle not found" };
  return {
    title: `${view.raffle.prizeName} — Raffle Hub`,
    description: `${view.raffle.numberCount} numbers at ${view.raffle.ticketPrice} ${view.raffle.assetCode}. Draws ${new Date(view.raffle.drawTime).toUTCString()}.`,
  };
}

export default async function RafflePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ buy?: string }>;
}) {
  const { id } = await params;
  const { buy } = await searchParams;

  const view = await loadRaffleView(id);
  if (!view) notFound();

  // Deep link from a scanned QR: /r/<id>?buy=<number>. Resolved here so the
  // buy sheet is open on arrival instead of popping in after hydration.
  const requested = Number(buy);
  const initialPick =
    buy && Number.isInteger(requested) && view.grid[requested - 1] === "free"
      ? requested
      : null;

  // The QR codes need an absolute URL. Deriving it from `window` would mean the
  // server renders no QR and the client renders one, which is a hydration
  // mismatch; the request's own headers give the same answer on both sides.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  return <RaffleBoard initial={view} initialPick={initialPick} origin={origin} />;
}
