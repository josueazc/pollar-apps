/**
 * Payment verification against public Stellar testnet data.
 *
 * Why Horizon and not the Pollar SDK's transaction history: `fetchTxHistory` is
 * scoped to the *authenticated* user's own wallet. The app needs to see the
 * payments arriving at the ORGANIZER's account while a BUYER is the one using
 * the browser, and no buyer session can read the organizer's history. Horizon
 * is public, needs no auth, exposes the memo (which carries our ticket
 * reference), and is the same data a third party would audit — so it is both
 * the practical choice and the verifiable one.
 *
 * Everything here is server-side and read-only.
 */

const HORIZON = "https://horizon-testnet.stellar.org";

export interface ExpectedPayment {
  reference: string;
  organizerAddress: string;
  amount: string;
  assetCode: string;
  assetIssuer: string | null;
}

export interface ConfirmedPayment {
  txHash: string;
  from: string;
  amount: string;
  assetCode: string;
  memo: string;
  createdAt: string;
  ledger: number;
}

export type VerifyResult =
  | { ok: true; payment: ConfirmedPayment }
  | { ok: false; reason: string; retryable: boolean };

async function horizonGet(path: string): Promise<unknown> {
  const res = await fetch(`${HORIZON}${path}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Horizon ${res.status} on ${path}`);
  return res.json();
}

/** Stellar amounts have 7 decimal places; compare them exactly, not as floats. */
function sameAmount(a: string, b: string): boolean {
  const norm = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(7) : null;
  };
  const na = norm(a);
  const nb = norm(b);
  return na !== null && na === nb;
}

function assetMatches(
  op: { asset_type?: string; asset_code?: string; asset_issuer?: string },
  expected: ExpectedPayment
): boolean {
  if (expected.assetCode === "XLM" && !expected.assetIssuer) {
    return op.asset_type === "native";
  }
  if (op.asset_type === "native") return false;
  if (op.asset_code !== expected.assetCode) return false;
  // An asset code alone is not an identity — anyone can issue "USDC". The
  // issuer is what makes it the real thing, so it is required when known.
  return !expected.assetIssuer || op.asset_issuer === expected.assetIssuer;
}

/**
 * Confirm that `txHash` really is the payment it claims to be.
 *
 * This is the trust boundary. The buyer's browser reports the hash it got back
 * from the Pollar SDK, but a hash from a client is just a claim: it could be
 * someone else's transaction, the wrong amount, or a payment to a different
 * account. Nothing is taken on faith — every field is re-read from Horizon.
 */
export async function verifyPayment(
  txHash: string,
  expected: ExpectedPayment
): Promise<VerifyResult> {
  if (!/^[0-9a-f]{64}$/i.test(txHash)) {
    return { ok: false, reason: "That is not a Stellar transaction hash.", retryable: false };
  }

  const tx = (await horizonGet(`/transactions/${txHash}`)) as {
    successful?: boolean;
    memo_type?: string;
    memo?: string;
    ledger?: number;
    created_at?: string;
  } | null;

  if (!tx) {
    // Horizon may not have ingested it yet — worth another poll.
    return { ok: false, reason: "Transaction not on the network yet.", retryable: true };
  }
  if (!tx.successful) {
    return { ok: false, reason: "That transaction failed on-chain.", retryable: false };
  }
  if (tx.memo_type !== "text" || tx.memo !== expected.reference) {
    return {
      ok: false,
      reason: `The payment's memo does not match this ticket (expected "${expected.reference}").`,
      retryable: false,
    };
  }

  const opsPage = (await horizonGet(`/transactions/${txHash}/operations?limit=200`)) as {
    _embedded?: { records?: Array<Record<string, string>> };
  } | null;
  const operations = opsPage?._embedded?.records ?? [];

  const payment = operations.find(
    (op) =>
      (op.type === "payment" || op.type === "path_payment_strict_receive") &&
      op.to === expected.organizerAddress &&
      assetMatches(op, expected) &&
      sameAmount(op.amount, expected.amount)
  );

  if (!payment) {
    return {
      ok: false,
      reason: `No payment of ${expected.amount} ${expected.assetCode} to the organizer in that transaction.`,
      retryable: false,
    };
  }

  return {
    ok: true,
    payment: {
      txHash,
      from: payment.from,
      amount: payment.amount,
      assetCode: expected.assetCode,
      memo: tx.memo,
      createdAt: tx.created_at ?? new Date().toISOString(),
      ledger: tx.ledger ?? 0,
    },
  };
}

/**
 * Recent payments into an account, newest first, with the memo joined in.
 *
 * The backstop for buyers whose browser never reported a hash — closed the tab,
 * lost signal, phone died. Their money still arrived, and the memo still says
 * which number they bought, so the ticket can be assigned without them.
 */
export async function recentPaymentsTo(
  address: string,
  limit = 50
): Promise<ConfirmedPayment[]> {
  const page = (await horizonGet(
    `/accounts/${address}/payments?order=desc&limit=${limit}&join=transactions`
  )) as { _embedded?: { records?: Array<Record<string, never>> } } | null;

  const records = (page?._embedded?.records ?? []) as unknown as Array<{
    type: string;
    to: string;
    from: string;
    amount: string;
    asset_type: string;
    asset_code?: string;
    transaction_hash: string;
    created_at: string;
    transaction?: { successful?: boolean; memo_type?: string; memo?: string; ledger?: number };
  }>;

  return records
    .filter(
      (r) =>
        r.type === "payment" &&
        r.to === address &&
        r.transaction?.successful === true &&
        r.transaction.memo_type === "text" &&
        typeof r.transaction.memo === "string"
    )
    .map((r) => ({
      txHash: r.transaction_hash,
      from: r.from,
      amount: r.amount,
      assetCode: r.asset_type === "native" ? "XLM" : (r.asset_code ?? ""),
      memo: r.transaction!.memo!,
      createdAt: r.created_at,
      ledger: r.transaction!.ledger ?? 0,
    }));
}

/** Explorer link for a transaction, shown next to every sale in the history. */
export function explorerTx(hash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}
