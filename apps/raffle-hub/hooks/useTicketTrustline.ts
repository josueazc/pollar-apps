"use client";

import { useCallback } from "react";
import { usePollar } from "@pollar/react";
import { TICKET_ASSET } from "@/lib/raffle";

/**
 * Makes sure the buyer's wallet can hold USDC before they try to pay with it.
 *
 * On Stellar an account cannot receive or send an issued asset until it has a
 * trustline for it. Native XLM needs none, so while tickets were priced in XLM
 * this never came up — the moment they became USDC, any buyer whose wallet had
 * no USDC trustline simply could not pay, and the failure surfaces as an opaque
 * transaction error rather than anything a buyer could act on.
 *
 * Pollar sponsors the trustline by default: the app covers the 0.5 XLM reserve
 * and the fee, so a first-time buyer needs no XLM of their own. That matters
 * for this audience — somebody buying a raffle number from their phone should
 * not have to learn what a reserve is.
 */
export function useTicketTrustline() {
  const { getClient } = usePollar();

  /**
   * Resolves once the wallet holds the ticket asset's trustline, establishing
   * it first if needed. Safe to call before every purchase: when the trustline
   * is already there it costs one state read and no transaction.
   */
  return useCallback(async (): Promise<void> => {
    const client = getClient();

    const hasTrustline = () => {
      const state = client.getEnabledAssetsState();
      if (state.step !== "loaded") return false;
      return state.data.assets.some(
        (asset) =>
          asset.code === TICKET_ASSET.code &&
          asset.issuer === TICKET_ASSET.issuer &&
          asset.trustlineEstablished === true
      );
    };

    await client.refreshAssets();
    if (hasTrustline()) return;

    await client.setTrustline({
      code: TICKET_ASSET.code,
      issuer: TICKET_ASSET.issuer,
    });
    // setTrustline does not refresh on its own.
    await client.refreshAssets();

    if (!hasTrustline()) {
      throw new Error(
        `Could not enable ${TICKET_ASSET.code} on your wallet. Nothing was charged — try again in a moment.`
      );
    }
  }, [getClient]);
}
