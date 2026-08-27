/**
 * Types for lib/draw.mjs.
 *
 * The engine itself is plain JavaScript on purpose — a third party auditing the
 * draw should be able to read and run it without a TypeScript toolchain — so
 * its types live here instead of inline.
 */

export interface DrawLedger {
  sequence: number;
  hash: string;
  closedAt: string;
  explorer: string;
  horizon: string;
}

export interface DrawProof {
  mechanism: "stellar-testnet-ledger-hash";
  drawTime: string;
  ledger: DrawLedger;
  soldTickets: number[];
  soldCount: number;
  winningIndex: number;
  winningNumber: number;
}

export interface VerificationCheck {
  name: string;
  expected: unknown;
  actual: unknown;
  ok: boolean;
}

export function latestLedger(): Promise<Record<string, unknown>>;
export function ledgerBySequence(seq: number): Promise<Record<string, unknown>>;
export function findDrawLedger(drawTimeIso: string): Promise<Record<string, unknown>>;
export function winningIndex(ledgerHash: string, soldCount: number): number;
export function runDraw(drawTimeIso: string, soldTicketNumbers: number[]): Promise<DrawProof>;
export function verifyProof(
  proof: DrawProof
): Promise<{ ok: boolean; checks: VerificationCheck[] }>;
