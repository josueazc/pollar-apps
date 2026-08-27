import { NextResponse } from "next/server";
import { loadRaffleView } from "@/lib/view";

/**
 * The raffle as JSON, for the page's live refresh. Deliberately readable by
 * anyone without a session: the grid and the proof are the point.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const view = await loadRaffleView(id);
  if (!view) {
    return NextResponse.json({ error: "No raffle with that code." }, { status: 404 });
  }
  return NextResponse.json(view);
}
