import type { SubmitOutcome, WalletBalanceRecord } from "@pollar/core";

/** Asset for `runTx('payment', …)`. */
export type PaymentAsset =
  | { type: "native" }
  | { type: "credit_alphanum4" | "credit_alphanum12"; code: string; issuer: string };

export type PaymentResult = Extract<
  SubmitOutcome,
  { status: "success" | "pending" }
>;

/**
 * The asset a payment should use: the app's primary asset from useBalance(),
 * falling back to native XLM while the balance hasn't loaded yet.
 */
export function paymentAssetFrom(
  record: WalletBalanceRecord | null
): PaymentAsset {
  if (
    record &&
    (record.type === "credit_alphanum4" || record.type === "credit_alphanum12") &&
    record.issuer
  ) {
    return { type: record.type, code: record.code, issuer: record.issuer };
  }
  return { type: "native" };
}

export function currencyOf(asset: PaymentAsset): string {
  return asset.type === "native" ? "XLM" : asset.code;
}

/** Loose G-address sanity check; the server does the real validation. */
export function looksLikeAddress(value: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(value.trim());
}
