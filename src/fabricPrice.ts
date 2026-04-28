"use strict";

import { hubUrl } from "./hubHttp";

export type BtcExchangeRatesOk = {
  ok: true;
  source: string;
  base: string;
  rates: Record<string, number>;
  fetchedAt: string;
};

export type BtcExchangeRatesResult = BtcExchangeRatesOk | { ok: false; error: string };

/**
 * Hub {@code GET /api/price/btc} — BTC spot rates per fiat (same Coinbase feed as {@code @fabric/price}
 * `services/coinbase.js`), cached on the server.
 */
export async function fetchBtcExchangeRatesFromHub(): Promise<BtcExchangeRatesResult> {
  let res: Response;
  try {
    res = await fetch(hubUrl("/api/price/btc"), {
      headers: { Accept: "application/json" },
    });
  } catch {
    return { ok: false, error: "network" };
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err =
      typeof data.error === "string"
        ? data.error
        : typeof data.message === "string"
          ? data.message
          : `http_${res.status}`;
    return { ok: false, error: err };
  }
  if (
    data &&
    data.ok === true &&
    typeof data.rates === "object" &&
    data.rates !== null &&
    typeof data.fetchedAt === "string"
  ) {
    return data as unknown as BtcExchangeRatesOk;
  }
  return { ok: false, error: "bad_payload" };
}

/** Coinbase returns fiat units **per 1 full BTC**. */
export function satsToFiat(sats: number, fiatPerBtc: number): number {
  return (sats / 1e8) * fiatPerBtc;
}

export function formatFiatAmount(amount: number, currencyCode: "USD" | "RUB"): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: amount >= 100 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}
