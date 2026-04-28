"use strict";

/**
 * BTC→fiat spot rates for the Family Tasks UI.
 *
 * Uses the same public endpoint and rate shape as
 * `node_modules/@fabric/price/services/coinbase.js` (`getQuoteForSymbol`):
 * GET https://api.coinbase.com/v2/exchange-rates?currency=BTC
 *
 * The full `@fabric/price` Feed service is a separate Node process; this handler
 * keeps the browser bundle small and avoids pulling `@fabric/core` into the server path.
 */

const COINBASE_BTC_RATES = "https://api.coinbase.com/v2/exchange-rates?currency=BTC";

/** @type {{ at: number; payload: unknown } | null } */
let cache = null;
const CACHE_MS = 120_000;

async function pullCoinbaseBtcRates() {
  const res = await fetch(COINBASE_BTC_RATES, {
    headers: { Accept: "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`coinbase_http_${res.status}`);
  }
  const raw = body?.data?.rates;
  if (!raw || typeof raw !== "object") {
    throw new Error("coinbase_invalid_payload");
  }
  /** @type {Record<string, number>} */
  const rates = {};
  for (const [code, s] of Object.entries(raw)) {
    const n = typeof s === "string" ? parseFloat(s) : Number(s);
    if (Number.isFinite(n) && n > 0) {
      rates[code] = n;
    }
  }
  if (Object.keys(rates).length === 0) {
    throw new Error("coinbase_no_rates");
  }
  return {
    ok: true,
    source: "coinbase",
    base: "BTC",
    rates,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * @param {import("@fabric/hub").default | { http: { _addRoute: Function } }} hub
 */
export function mountBitcoinPriceRoute(hub) {
  hub.http._addRoute("get", "/api/price/btc", async (_req, res) => {
    try {
      const now = Date.now();
      if (cache && now - cache.at < CACHE_MS) {
        res.type("application/json").send(JSON.stringify(cache.payload));
        return;
      }
      const payload = await pullCoinbaseBtcRates();
      cache = { at: now, payload };
      res.type("application/json").send(JSON.stringify(payload));
    } catch (e) {
      const msg = e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
      res.status(502).json({ ok: false, error: msg || "price_fetch_failed" });
    }
  });
}
