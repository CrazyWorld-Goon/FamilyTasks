"use strict";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchBtcExchangeRatesFromHub, formatFiatAmount } from "../fabricPrice";
import {
  readStoredFiatCurrency,
  subscribeFiatCurrencyChanged,
  type FiatCurrencyCode,
} from "../settings/currencies";

const REFRESH_MS = 90_000;

/** Spot line for the app shell header; matches wallet fiat picker via {@link broadcastFiatCurrencyChanged}. */
export function HeaderBtcSpot({
  fiatSpotLabel,
  loadingLabel,
}: {
  fiatSpotLabel: (amount: string) => string;
  loadingLabel: string;
}) {
  const [fiat, setFiat] = useState<FiatCurrencyCode>(() => readStoredFiatCurrency());
  const [amountLabel, setAmountLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const fetchGen = useRef(0);

  useEffect(() => subscribeFiatCurrencyChanged(() => setFiat(readStoredFiatCurrency())), []);

  const refresh = useCallback(
    async (opts?: { quiet?: boolean }) => {
      const quiet = opts?.quiet === true;
      const gen = ++fetchGen.current;
      if (!quiet) {
        setPending(true);
        setAmountLabel(null);
        setError(null);
      }

      const res = await fetchBtcExchangeRatesFromHub();
      if (gen !== fetchGen.current) return;

      if (!res.ok) {
        setAmountLabel(null);
        setError(res.error);
        if (!quiet) setPending(false);
        return;
      }
      const n = res.rates[fiat];
      if (typeof n === "number" && Number.isFinite(n) && n > 0) {
        setAmountLabel(formatFiatAmount(n, fiat));
        setError(null);
      } else {
        setAmountLabel(null);
        setError("rate_missing");
      }
      if (!quiet) setPending(false);
    },
    [fiat],
  );

  useEffect(() => {
    void refresh({ quiet: false });
  }, [refresh]);

  useEffect(() => {
    const id = setInterval(() => void refresh({ quiet: true }), REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  let body: JSX.Element | string;
  if (pending && amountLabel === null && !error) {
    body = loadingLabel;
  } else if (amountLabel != null) {
    body = fiatSpotLabel(amountLabel);
  } else {
    body = "—";
  }

  return (
    <span
      className="header-btc-ticker"
      role="status"
      aria-live="polite"
      title={error && !amountLabel ? (error === "rate_missing" ? "" : error) : undefined}
    >
      {body}
    </span>
  );
}
