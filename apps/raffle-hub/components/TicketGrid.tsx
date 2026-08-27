"use client";

import type { TicketStatus } from "@/lib/raffle";

const STYLES: Record<TicketStatus, string> = {
  free: "border-border bg-background text-foreground hover:border-primary hover:bg-primary-light hover:text-primary",
  reserved: "border-warning-border bg-warning-light text-warning cursor-not-allowed",
  sold: "border-success-border bg-success-light text-success cursor-not-allowed",
};

const LABELS: Record<TicketStatus, string> = {
  free: "free",
  reserved: "being paid for",
  sold: "sold",
};

/**
 * The grid of numbers — the centrepiece of the public page.
 *
 * Status is conveyed by shape and text as well as colour: the number of a sold
 * ticket is struck through and every cell carries a title, so the grid still
 * reads for someone who cannot separate the green from the amber.
 */
export function TicketGrid({
  grid,
  onPick,
  disabled = false,
  winningNumber = null,
}: {
  grid: TicketStatus[];
  onPick: (n: number) => void;
  disabled?: boolean;
  winningNumber?: number | null;
}) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(3.25rem, 1fr))" }}
      role="list"
      aria-label="Raffle numbers"
    >
      {grid.map((status, index) => {
        const number = index + 1;
        const isWinner = winningNumber === number;
        const pickable = status === "free" && !disabled;

        return (
          <button
            key={number}
            role="listitem"
            type="button"
            disabled={!pickable}
            onClick={() => onPick(number)}
            title={`Number ${number} — ${isWinner ? "WINNER" : LABELS[status]}`}
            aria-label={`Number ${number}, ${isWinner ? "winner" : LABELS[status]}`}
            className={`relative flex aspect-square items-center justify-center rounded-xl border-2 font-mono text-sm font-semibold transition-all duration-150 ${
              isWinner
                ? "border-primary bg-primary text-primary-foreground shadow-md"
                : STYLES[status]
            } ${pickable ? "enabled:active:scale-[0.94] cursor-pointer" : ""} ${
              disabled && status === "free" ? "opacity-40" : ""
            }`}
          >
            <span className={status === "sold" && !isWinner ? "line-through decoration-1" : ""}>
              {number}
            </span>
            {isWinner && (
              <span className="absolute -top-1.5 -right-1.5 text-base" aria-hidden>
                🏆
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function GridLegend({ soldCount, total }: { soldCount: number; total: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded border-2 border-border bg-background" /> free
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded border-2 border-warning-border bg-warning-light" /> being
        paid for
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded border-2 border-success-border bg-success-light" /> sold
      </span>
      <span className="ml-auto font-mono">
        {soldCount}/{total} sold
      </span>
    </div>
  );
}
