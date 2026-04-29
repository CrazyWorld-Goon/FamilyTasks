"use strict";

import { useCallback, useEffect, useState } from "react";
import {
  fetchHubBitcoinSnapshot,
  pickReceiveAddress,
  pickWalletId,
} from "../hubBitcoin";
import { hubUrl } from "../hubHttp";
import type { ShoppingItem } from "../types";
import { useI18n } from "../i18n/I18nProvider";

export function FundShoppingInline({
  item,
  onPatchBudget,
}: {
  item: ShoppingItem;
  onPatchBudget: (id: string, budgetSats: number) => void;
}) {
  const { t } = useI18n();
  const [fundOpen, setFundOpen] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState(item.budgetSats != null ? String(item.budgetSats) : "");
  const [receiveAddr, setReceiveAddr] = useState<string | null>(null);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    setBudgetDraft(item.budgetSats != null ? String(item.budgetSats) : "");
  }, [item.id, item.budgetSats]);

  const refreshFundingInfo = useCallback(async () => {
    setLoadErr(null);
    try {
      const snap = await fetchHubBitcoinSnapshot(true);
      const recv = pickReceiveAddress(snap);
      const wid = pickWalletId(snap);
      setReceiveAddr(recv);
      setWalletId(wid);
      if (!recv) {
        if (!snap.address.ok) setLoadErr(snap.address.error);
        else if (!snap.wallets.ok) setLoadErr(snap.wallets.error);
      }
    } catch {
      setLoadErr("network");
    }
  }, []);

  useEffect(() => {
    if (fundOpen) void refreshFundingInfo();
  }, [fundOpen, refreshFundingInfo]);

  const applyBudget = () => {
    const n = Number(budgetDraft);
    if (!Number.isFinite(n) || n <= 0) {
      onPatchBudget(item.id, 0);
      return;
    }
    onPatchBudget(item.id, Math.floor(n));
  };

  const amount = item.budgetSats != null && item.budgetSats > 0 ? item.budgetSats : Number(budgetDraft) > 0 ? Math.floor(Number(budgetDraft)) : null;

  return (
    <div className="fund-shopping-inline">
      <div className="fund-shopping-budget-row">
        <label className="fund-shopping-budget-label">
          <span>{t("shopRow.budgetLabel")}</span>
          <input
            inputMode="numeric"
            className="fund-shopping-budget-input"
            value={budgetDraft}
            onChange={(e) => setBudgetDraft(e.target.value)}
            onBlur={applyBudget}
            placeholder="—"
            aria-label={t("shopRow.budgetLabel")}
          />
        </label>
        <button type="button" className="btn btn-ghost btn-sm" onClick={applyBudget}>
          {t("shopRow.budgetSave")}
        </button>
      </div>
      <button type="button" className="btn btn-ghost btn-sm fund-shopping-toggle" onClick={() => setFundOpen((v) => !v)}>
        {fundOpen ? t("shopRow.fundHide") : t("shopRow.fundNow")}
      </button>
      {fundOpen ? (
        <div className="fund-shopping-panel card">
          <p className="section-hint">{t("shopRow.fundHint")}</p>
          {amount != null && amount > 0 ? (
            <p className="fund-shopping-amount">
              <strong>{t("shopRow.fundTarget", { n: amount })}</strong>
            </p>
          ) : (
            <p className="section-hint">{t("shopRow.fundSetBudgetFirst")}</p>
          )}
          {loadErr ? (
            <p className="wallet-summary-status wallet-summary-status--warn" role="status">
              {t("wallet.walletsUnavailable", { detail: loadErr })}
            </p>
          ) : null}
          {receiveAddr ? (
            <div className="fund-shopping-address">
              <code className="fund-shopping-address-code">{receiveAddr}</code>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(receiveAddr);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                {t("shopRow.copyAddress")}
              </button>
            </div>
          ) : !loadErr ? (
            <p className="section-hint">{t("shopRow.noReceiveAddress")}</p>
          ) : null}
          {walletId ? (
            <p className="section-hint fund-shopping-wallet-id">
              <small>{t("shopRow.walletId", { id: walletId })}</small>
            </p>
          ) : null}
          <a className="btn btn-secondary btn-sm" href={hubUrl("/services/bitcoin")}>
            {t("wallet.openDashboard")}
          </a>
        </div>
      ) : null}
    </div>
  );
}
