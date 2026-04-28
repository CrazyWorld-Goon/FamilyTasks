"use strict";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { fetchBtcExchangeRatesFromHub, formatFiatAmount, satsToFiat } from "../fabricPrice";
import { fetchHubBitcoinSnapshot, parseWalletBalances } from "../hubBitcoin";
import { hubUrl } from "../hubHttp";
import { useI18n } from "../i18n/I18nProvider";
import {
  broadcastFiatCurrencyChanged,
  FIAT_CURRENCY_STORAGE_KEY,
  FIAT_CURRENCIES,
  type FiatCurrencyCode,
  isFiatCurrencyCode,
  readStoredFiatCurrency,
} from "../settings/currencies";

function formatSatoshis(n: number): string {
  try {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
  } catch {
    return String(Math.round(n));
  }
}

/** Balances are always in sats (Fabric baseline); fiat is a reference when rate exists. */
function renderSatsWithFiatRef(
  sats: number,
  fiat: FiatCurrencyCode,
  fiatPerBtc: Record<string, number> | null,
  t: (path: string, vars?: Record<string, string | number>) => string,
): JSX.Element {
  const r = fiatPerBtc?.[fiat];
  const equiv =
    r != null && Number.isFinite(r) && r > 0 ? satsToFiat(sats, r) : null;
  if (equiv != null) {
    return (
      <>
        <span className="wallet-summary-sats-primary">
          {t("wallet.satsAmount", { n: formatSatoshis(sats) })}
        </span>{" "}
        <span className="wallet-summary-fiat-secondary">
          ({formatFiatAmount(equiv, fiat)})
        </span>
      </>
    );
  }
  return <>{t("wallet.satsAmount", { n: formatSatoshis(sats) })}</>;
}

export function WalletSummaryCard({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);

  /** Last snapshot bits for display */
  const [statusAvailable, setStatusAvailable] = useState<boolean | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [balanceSats, setBalanceSats] = useState<number | null>(null);
  const [confirmedSats, setConfirmedSats] = useState<number | null>(null);
  const [unconfirmedSats, setUnconfirmedSats] = useState<number | null>(null);
  const [walletSummaryId, setWalletSummaryId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [walletsError, setWalletsError] = useState<string | null>(null);
  const [fiatCurrency, setFiatCurrency] = useState<FiatCurrencyCode>(readStoredFiatCurrency);
  const [btcRates, setBtcRates] = useState<Record<string, number> | null>(null);
  const [btcRatesError, setBtcRatesError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setStatusError(null);
    setWalletsError(null);
    setBtcRatesError(null);
    try {
      const [snap, priceRes] = await Promise.all([
        fetchHubBitcoinSnapshot(true),
        fetchBtcExchangeRatesFromHub(),
      ]);
      if (priceRes.ok) {
        setBtcRates(priceRes.rates);
      } else {
        setBtcRates(null);
        setBtcRatesError(priceRes.error);
      }
      if (!snap.status.ok) {
        setStatusError(snap.status.error || String(snap.status.httpStatus));
        setStatusAvailable(null);
        setNetwork(null);
        setHeight(null);
      } else {
        setStatusError(null);
      }
      if (!snap.wallets.ok) {
        setWalletsError(snap.wallets.error || String(snap.wallets.httpStatus));
        setBalanceSats(null);
        setConfirmedSats(null);
        setUnconfirmedSats(null);
        setWalletSummaryId(null);
      } else {
        setWalletsError(null);
      }

      const st = snap.status.ok ? snap.status.json : null;
      if (st) {
        const av = Boolean(st.available === true || st.status === "OK");
        setStatusAvailable(av);
        const nw = typeof st.network === "string" ? st.network : null;
        const h =
          typeof st.height === "number"
            ? st.height
            : typeof st.blockHeight === "number"
              ? st.blockHeight
              : null;
        setNetwork(nw ?? null);
        setHeight(Number.isFinite(h as number) ? (h as number) : null);
      } else {
        setStatusAvailable(null);
        setNetwork(null);
        setHeight(null);
      }

      if (snap.wallets.ok && snap.wallets.json) {
        const b = parseWalletBalances(snap.wallets.json);
        setBalanceSats(b.balanceSats);
        setConfirmedSats(b.confirmedSats);
        setUnconfirmedSats(b.unconfirmedSats);
        setWalletSummaryId(b.walletId);
        if (!network && b.network) setNetwork(b.network);
      } else {
        setBalanceSats(null);
        setConfirmedSats(null);
        setUnconfirmedSats(null);
        setWalletSummaryId(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const fiatPerUnitBtc =
    btcRates && Number.isFinite(btcRates[fiatCurrency])
      ? btcRates[fiatCurrency]
      : null;

  return (
    <div className={`card wallet-summary-card ${className}`.trim()}>
      <div className="wallet-summary-heading-block">
        <h3 className="wallet-summary-heading">{t("wallet.heading")}</h3>
        {!loading && fiatPerUnitBtc != null && fiatPerUnitBtc > 0 ? (
          <p className="wallet-summary-spot-rate" role="status">
            {t("wallet.fiatSpotRate", {
              amount: formatFiatAmount(fiatPerUnitBtc, fiatCurrency),
            })}
          </p>
        ) : null}
      </div>
      <p className="section-hint">{t("wallet.hint")}</p>
      {loading ? <p className="wallet-summary-status">{t("wallet.loading")}</p> : null}
      {!loading && statusError ? (
        <p className="wallet-summary-status wallet-summary-status--warn" role="status">
          {t("wallet.statusError", { detail: statusError })}
        </p>
      ) : null}
      {!loading && !statusError && btcRatesError ? (
        <p className="wallet-summary-status wallet-summary-status--warn" role="status">
          {t("wallet.rateError", { detail: btcRatesError })}
        </p>
      ) : null}
      {!loading && !statusError && statusAvailable !== null ? (
        <dl className="wallet-summary-dl">
          <div className="wallet-summary-row">
            <dt>{t("wallet.available")}</dt>
            <dd>{statusAvailable ? t("wallet.yes") : t("wallet.no")}</dd>
          </div>
          {network ? (
            <div className="wallet-summary-row">
              <dt>{t("wallet.network")}</dt>
              <dd>{network}</dd>
            </div>
          ) : null}
          {height != null ? (
            <div className="wallet-summary-row">
              <dt>{t("wallet.height")}</dt>
              <dd>{height}</dd>
            </div>
          ) : null}
          {confirmedSats != null ? (
            <div className="wallet-summary-row">
              <dt>{t("wallet.confirmedBalance")}</dt>
              <dd>{renderSatsWithFiatRef(confirmedSats, fiatCurrency, btcRates, t)}</dd>
            </div>
          ) : null}
          {unconfirmedSats != null && unconfirmedSats > 0 ? (
            <div className="wallet-summary-row">
              <dt>{t("wallet.pendingBalance")}</dt>
              <dd>{renderSatsWithFiatRef(unconfirmedSats, fiatCurrency, btcRates, t)}</dd>
            </div>
          ) : null}
          {balanceSats != null && balanceSats !== confirmedSats ? (
            <div className="wallet-summary-row">
              <dt>{t("wallet.totalBalance")}</dt>
              <dd>{renderSatsWithFiatRef(balanceSats, fiatCurrency, btcRates, t)}</dd>
            </div>
          ) : null}
          {walletSummaryId ? (
            <div className="wallet-summary-row">
              <dt>{t("wallet.walletId")}</dt>
              <dd className="wallet-summary-wallet-id">
                <small>{walletSummaryId}</small>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {!loading && walletsError && !statusError ? (
        <p className="wallet-summary-status wallet-summary-status--warn" role="status">
          {t("wallet.walletsUnavailable", { detail: walletsError })}
        </p>
      ) : null}
      <div className="wallet-summary-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>
          {t("wallet.refresh")}
        </button>
        <a className="btn btn-secondary btn-sm" href={hubUrl("/services/bitcoin")}>
          {t("wallet.openDashboard")}
        </a>
      </div>
      <label className="wallet-summary-currency">
        <span className="wallet-summary-currency-label">{t("wallet.fiatCurrency")}</span>
        <select
          className="wallet-summary-currency-select"
          value={fiatCurrency}
          aria-label={t("wallet.fiatCurrency")}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
            const v = e.target.value;
            if (!isFiatCurrencyCode(v)) return;
            setFiatCurrency(v);
            try {
              window.localStorage.setItem(FIAT_CURRENCY_STORAGE_KEY, v);
            } catch {
              // ignore
            }
            broadcastFiatCurrencyChanged();
          }}
        >
          {FIAT_CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {t(`wallet.fiat.${code}`)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
