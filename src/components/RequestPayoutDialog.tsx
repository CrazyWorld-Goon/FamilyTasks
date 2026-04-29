"use strict";

import { useEffect, useId, useState, type FormEvent } from "react";
import type { FabricActorId } from "../fabricIds";
import { useI18n } from "../i18n/I18nProvider";
import { IconClose } from "./Icons";

export function RequestPayoutDialog({
  open,
  onClose,
  fromMemberId,
  shoppingItemId,
  contextHint,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  fromMemberId: FabricActorId;
  shoppingItemId?: FabricActorId;
  contextHint?: string;
  onSubmit: (input: {
    fromMemberId: FabricActorId;
    amountSats: number;
    memo: string;
    shoppingItemId?: FabricActorId;
  }) => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");

  useEffect(() => {
    if (open) {
      setAmount("");
      setMemo("");
    }
  }, [open, fromMemberId, shoppingItemId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || Math.floor(n) <= 0) return;
    onSubmit({
      fromMemberId,
      amountSats: Math.floor(n),
      memo: memo.trim(),
      ...(shoppingItemId ? { shoppingItemId } : {}),
    });
    onClose();
  };

  return (
    <div className="owner-admin-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card request-payout-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="request-payout-header">
          <h2 id={titleId}>{t("payout.dialogTitle")}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label={t("adminPanel.closeAria")}>
            <IconClose size={22} />
          </button>
        </div>
        <p className="section-hint">{t("payout.dialogIntro")}</p>
        {contextHint ? <p className="section-hint request-payout-context">{contextHint}</p> : null}
        <form className="forms" onSubmit={submit}>
          <label className="family-profile-field">
            <span className="family-profile-label">{t("payout.amountLabel")}</span>
            <input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t("payout.amountPlaceholder")}
              aria-label={t("payout.amountLabel")}
              required
            />
          </label>
          <label className="family-profile-field">
            <span className="family-profile-label">{t("payout.memoLabel")}</span>
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder={t("payout.memoPlaceholder")}
              aria-label={t("payout.memoLabel")}
            />
          </label>
          <div className="request-payout-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {t("dismiss")}
            </button>
            <button type="submit" className="btn btn-primary">
              {t("payout.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
