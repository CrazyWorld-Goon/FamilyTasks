"use strict";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  fetchBitcoinTransaction,
  normalizeTxid,
  parseBitcoinServiceNetwork,
  postBitcoinFaucet,
  postPublicFabricFaucet,
} from "../hubBitcoinExtras";
import {
  fetchHubBitcoinSnapshot,
  pickReceiveAddress,
} from "../hubBitcoin";
import { hubUrl, getPublicFabricHubOrigin, publicFabricHubBitcoinTxUrl } from "../hubHttp";
import { useI18n } from "../i18n/I18nProvider";

const DEFAULT_FAUCET_SATS = 10_000;
const MAX_FAUCET_SATS = 1_000_000;

function numUnknown(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

export function BitcoinToolsCard({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  const [loadingHub, setLoadingHub] = useState(true);
  const [hubNetwork, setHubNetwork] = useState<string | null>(null);
  const [defaultAddress, setDefaultAddress] = useState("");
  const [faucetAddr, setFaucetAddr] = useState("");
  const [faucetSats, setFaucetSats] = useState(String(DEFAULT_FAUCET_SATS));
  const [faucetBusy, setFaucetBusy] = useState(false);
  const [faucetMsg, setFaucetMsg] = useState<string | null>(null);
  const [faucetOkTxid, setFaucetOkTxid] = useState<string | null>(null);

  const [publicFaucetAddr, setPublicFaucetAddr] = useState("");
  const [publicFaucetSats, setPublicFaucetSats] = useState(String(DEFAULT_FAUCET_SATS));
  const [publicFaucetBusy, setPublicFaucetBusy] = useState(false);
  const [publicFaucetMsg, setPublicFaucetMsg] = useState<string | null>(null);
  const [publicFaucetOkTxid, setPublicFaucetOkTxid] = useState<string | null>(null);

  const [explorerTxid, setExplorerTxid] = useState("");
  const [explorerBusy, setExplorerBusy] = useState(false);
  const [explorerJson, setExplorerJson] = useState<Record<string, unknown> | null>(null);
  const [explorerErr, setExplorerErr] = useState<string | null>(null);

  const reloadHubContext = useCallback(async () => {
    setLoadingHub(true);
    setFaucetMsg(null);
    setFaucetOkTxid(null);
    setPublicFaucetMsg(null);
    setPublicFaucetOkTxid(null);
    try {
      const snap = await fetchHubBitcoinSnapshot(true);
      const net = snap.status.ok ? parseBitcoinServiceNetwork(snap.status.json) : null;
      setHubNetwork(net);
      const addr = pickReceiveAddress(snap) || "";
      setDefaultAddress(addr);
      setFaucetAddr((prev) => (prev.trim() ? prev : addr));
      setPublicFaucetAddr((prev) => (prev.trim() ? prev : addr));
    } finally {
      setLoadingHub(false);
    }
  }, []);

  useEffect(() => {
    void reloadHubContext();
  }, [reloadHubContext]);

  const isRegtest = hubNetwork === "regtest";

  const onPublicFaucet = async (e: FormEvent) => {
    e.preventDefault();
    setPublicFaucetBusy(true);
    setPublicFaucetMsg(null);
    setPublicFaucetOkTxid(null);
    const raw = publicFaucetSats.trim();
    const n = raw === "" ? DEFAULT_FAUCET_SATS : Math.round(Number(raw));
    const amountSats =
      Number.isFinite(n) && n > 0 ? Math.min(MAX_FAUCET_SATS, Math.max(1, n)) : DEFAULT_FAUCET_SATS;

    const res = await postPublicFabricFaucet({
      address: publicFaucetAddr.trim() || defaultAddress,
      amountSats,
    });

    setPublicFaucetBusy(false);
    if (res.ok) {
      setPublicFaucetOkTxid(res.txid);
      setPublicFaucetMsg(t("bitcoinTools.faucetSuccess", { txid: res.txid }));
    } else {
      setPublicFaucetMsg(res.error || t("bitcoinTools.publicFaucetFailed"));
    }
  };

  const onFaucet = async (e: FormEvent) => {
    e.preventDefault();
    setFaucetBusy(true);
    setFaucetMsg(null);
    setFaucetOkTxid(null);
    const raw = faucetSats.trim();
    const n = raw === "" ? DEFAULT_FAUCET_SATS : Math.round(Number(raw));
    const amountSats =
      Number.isFinite(n) && n > 0 ? Math.min(MAX_FAUCET_SATS, Math.max(1, n)) : DEFAULT_FAUCET_SATS;

    const res = await postBitcoinFaucet({
      address: faucetAddr.trim() || defaultAddress,
      amountSats,
    });

    setFaucetBusy(false);
    if (res.ok) {
      setFaucetOkTxid(res.txid);
      setFaucetMsg(t("bitcoinTools.faucetSuccess", { txid: res.txid }));
    } else {
      setFaucetMsg(res.error || t("bitcoinTools.faucetFailed"));
    }
  };

  const onExplorer = async (e: FormEvent) => {
    e.preventDefault();
    const id = normalizeTxid(explorerTxid);
    setExplorerBusy(true);
    setExplorerErr(null);
    setExplorerJson(null);
    if (!id) {
      setExplorerBusy(false);
      setExplorerErr(t("bitcoinTools.explorerInvalidTxid"));
      return;
    }
    const res = await fetchBitcoinTransaction(id);
    setExplorerBusy(false);
    if (res.ok) {
      setExplorerJson(res.json);
    } else {
      setExplorerErr(
        res.httpStatus === 404
          ? t("bitcoinTools.explorerNotFound")
          : res.error === "invalid_txid"
            ? t("bitcoinTools.explorerInvalidTxid")
            : res.error,
      );
    }
  };

  const txSummary = explorerJson;
  const confirmations = txSummary ? numUnknown(txSummary.confirmations) : null;
  const blocktime = txSummary ? numUnknown(txSummary.blocktime) : null;
  const size = txSummary ? numUnknown(txSummary.size) : null;
  const vsize = (() => {
    if (!txSummary) return null;
    const v = numUnknown(txSummary.vsize);
    if (v != null) return v;
    const w = numUnknown(txSummary.weight);
    if (w != null) return Math.ceil(w / 4);
    return null;
  })();

  return (
    <div className={`card bitcoin-tools-card ${className}`.trim()}>
      <h3 className="bitcoin-tools-heading">{t("bitcoinTools.heading")}</h3>
      <p className="section-hint">{t("bitcoinTools.hint")}</p>

      <div className="bitcoin-tools-section">
        <h4 className="bitcoin-tools-subheading">{t("bitcoinTools.explorerHeading")}</h4>
        <p className="section-hint bitcoin-tools-micro-hint">{t("bitcoinTools.explorerHint")}</p>
        <form className="bitcoin-tools-form" onSubmit={onExplorer}>
          <label className="bitcoin-tools-field">
            <span>{t("bitcoinTools.explorerTxid")}</span>
            <input
              value={explorerTxid}
              onChange={(e) => setExplorerTxid(e.target.value)}
              placeholder="abcd…"
              autoComplete="off"
              spellCheck={false}
              className="bitcoin-tools-txid-input"
              aria-label={t("bitcoinTools.explorerTxid")}
            />
          </label>
          <div className="bitcoin-tools-row">
            <button type="submit" className="btn btn-secondary btn-sm" disabled={explorerBusy}>
              {explorerBusy ? t("bitcoinTools.explorerLoading") : t("bitcoinTools.explorerSubmit")}
            </button>
            {explorerJson && normalizeTxid(explorerTxid) ? (
              <a
                className="btn btn-ghost btn-sm"
                href={hubUrl(`/services/bitcoin/transactions/${encodeURIComponent(normalizeTxid(explorerTxid))}`)}
                target="_blank"
                rel="noreferrer"
              >
                {t("bitcoinTools.explorerOpenHub")}
              </a>
            ) : null}
          </div>
        </form>
        {explorerErr ? (
          <p className="bitcoin-tools-msg bitcoin-tools-msg--warn" role="status">
            {explorerErr}
          </p>
        ) : null}
        {txSummary && !explorerErr ? (
          <dl className="bitcoin-tools-dl">
            {typeof txSummary.txid === "string" ? (
              <div className="bitcoin-tools-dl-row">
                <dt>{t("bitcoinTools.fieldTxid")}</dt>
                <dd className="bitcoin-tools-mono">{txSummary.txid}</dd>
              </div>
            ) : null}
            {confirmations != null ? (
              <div className="bitcoin-tools-dl-row">
                <dt>{t("bitcoinTools.explorerConfirmations")}</dt>
                <dd>{confirmations}</dd>
              </div>
            ) : null}
            {blocktime != null ? (
              <div className="bitcoin-tools-dl-row">
                <dt>{t("bitcoinTools.explorerBlockTime")}</dt>
                <dd>
                  {new Date(blocktime * 1000).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </dd>
              </div>
            ) : null}
            {size != null ? (
              <div className="bitcoin-tools-dl-row">
                <dt>{t("bitcoinTools.explorerSize")}</dt>
                <dd>{size} B</dd>
              </div>
            ) : null}
            {vsize != null ? (
              <div className="bitcoin-tools-dl-row">
                <dt>{t("bitcoinTools.explorerVsize")}</dt>
                <dd>{vsize} vB</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </div>

      <div className="bitcoin-tools-section bitcoin-tools-section--public-faucet">
        <h4 className="bitcoin-tools-subheading">{t("bitcoinTools.publicFaucetHeading")}</h4>
        <p className="section-hint bitcoin-tools-micro-hint">
          {t("bitcoinTools.publicFaucetHint", { maxSats: String(MAX_FAUCET_SATS) })}
        </p>
        <p className="bitcoin-tools-msg bitcoin-tools-msg--muted" role="note">
          {getPublicFabricHubOrigin()}
        </p>
        <form className="bitcoin-tools-form" onSubmit={onPublicFaucet}>
          <label className="bitcoin-tools-field">
            <span>{t("bitcoinTools.faucetAddress")}</span>
            <input
              value={publicFaucetAddr}
              onChange={(e) => setPublicFaucetAddr(e.target.value)}
              placeholder={defaultAddress || "tb1… / bc1…"}
              autoComplete="off"
              spellCheck={false}
              disabled={loadingHub}
              aria-label={t("bitcoinTools.faucetAddress")}
            />
          </label>
          <label className="bitcoin-tools-field">
            <span>{t("bitcoinTools.faucetAmount")}</span>
            <input
              type="number"
              min={1}
              max={MAX_FAUCET_SATS}
              step={1}
              value={publicFaucetSats}
              onChange={(e) => setPublicFaucetSats(e.target.value)}
              disabled={loadingHub}
              aria-label={t("bitcoinTools.faucetAmount")}
            />
          </label>
          <div className="bitcoin-tools-row">
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={loadingHub || publicFaucetBusy}
            >
              {publicFaucetBusy ? t("bitcoinTools.faucetSending") : t("bitcoinTools.faucetSubmit")}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void reloadHubContext()} disabled={loadingHub}>
              {t("wallet.refresh")}
            </button>
          </div>
        </form>
        {publicFaucetMsg ? (
          <p
            className={`bitcoin-tools-msg ${publicFaucetOkTxid ? "bitcoin-tools-msg--ok" : "bitcoin-tools-msg--warn"}`}
            role="status"
          >
            {publicFaucetMsg}
            {publicFaucetOkTxid ? (
              <>
                {" "}
                <a
                  href={publicFabricHubBitcoinTxUrl(publicFaucetOkTxid)}
                  target="_blank"
                  rel="noreferrer"
                  className="bitcoin-tools-inline-link"
                >
                  {t("bitcoinTools.publicFaucetOpenHub")}
                </a>
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      <div className="bitcoin-tools-section bitcoin-tools-section--faucet">
        <h4 className="bitcoin-tools-subheading">{t("bitcoinTools.faucetHeading")}</h4>
        <p className="section-hint bitcoin-tools-micro-hint">
          {t("bitcoinTools.faucetHint", { maxSats: String(MAX_FAUCET_SATS) })}
        </p>
        {!loadingHub && !isRegtest ? (
          <p className="bitcoin-tools-msg bitcoin-tools-msg--muted" role="status">
            {t("bitcoinTools.faucetRegtestOnly")}
          </p>
        ) : null}
        <form className="bitcoin-tools-form" onSubmit={onFaucet}>
          <label className="bitcoin-tools-field">
            <span>{t("bitcoinTools.faucetAddress")}</span>
            <input
              value={faucetAddr}
              onChange={(e) => setFaucetAddr(e.target.value)}
              placeholder={defaultAddress || "bcrt1…"}
              autoComplete="off"
              spellCheck={false}
              disabled={loadingHub || !isRegtest}
              aria-label={t("bitcoinTools.faucetAddress")}
            />
          </label>
          <label className="bitcoin-tools-field">
            <span>{t("bitcoinTools.faucetAmount")}</span>
            <input
              type="number"
              min={1}
              max={MAX_FAUCET_SATS}
              step={1}
              value={faucetSats}
              onChange={(e) => setFaucetSats(e.target.value)}
              disabled={loadingHub || !isRegtest}
              aria-label={t("bitcoinTools.faucetAmount")}
            />
          </label>
          <div className="bitcoin-tools-row">
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={loadingHub || !isRegtest || faucetBusy}
            >
              {faucetBusy ? t("bitcoinTools.faucetSending") : t("bitcoinTools.faucetSubmit")}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void reloadHubContext()} disabled={loadingHub}>
              {t("wallet.refresh")}
            </button>
          </div>
        </form>
        {faucetMsg ? (
          <p
            className={`bitcoin-tools-msg ${faucetOkTxid ? "bitcoin-tools-msg--ok" : "bitcoin-tools-msg--warn"}`}
            role="status"
          >
            {faucetMsg}
            {faucetOkTxid ? (
              <>
                {" "}
                <a
                  href={hubUrl(`/services/bitcoin/transactions/${encodeURIComponent(faucetOkTxid)}`)}
                  target="_blank"
                  rel="noreferrer"
                  className="bitcoin-tools-inline-link"
                >
                  {t("bitcoinTools.explorerOpenHub")}
                </a>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}
