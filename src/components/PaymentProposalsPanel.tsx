"use strict";

import type { FabricActorId } from "../fabricIds";
import type { FamilyMember, PaymentProposal } from "../types";
import { useI18n } from "../i18n/I18nProvider";

export function PaymentProposalsPanel({
  proposals,
  members,
  ownerUserId,
  canDecide,
  onApprove,
  onReject,
}: {
  proposals: PaymentProposal[];
  members: FamilyMember[];
  ownerUserId?: FabricActorId;
  canDecide: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const { t } = useI18n();
  const pending = proposals.filter((p) => p.status === "pending");
  const recent = proposals.filter((p) => p.status !== "pending").slice(-8).reverse();

  const labelFor = (id: FabricActorId) => members.find((m) => m.id === id)?.shortName ?? id.slice(0, 8);

  if (!ownerUserId) {
    return (
      <div className="card payment-proposals-card">
        <h3>{t("payout.proposalsHeading")}</h3>
        <p className="section-hint">{t("payout.noOwnerYet")}</p>
      </div>
    );
  }

  return (
    <div className="card payment-proposals-card">
      <h3>{t("payout.proposalsHeading")}</h3>
      <p className="section-hint">{t("payout.proposalsHint")}</p>

      {pending.length === 0 ? <p className="section-hint">{t("payout.nonePending")}</p> : null}

      <ul className="payment-proposal-list">
        {pending.map((p) => (
          <li key={p.id} className="payment-proposal-row payment-proposal-row--pending">
            <div className="payment-proposal-body">
              <div className="payment-proposal-type">{t("payout.fabricType")}</div>
              <div className="payment-proposal-meta">
                <strong>{labelFor(p.fromMemberId)}</strong>
                <span className="payment-proposal-amount">{t("payout.amountSats", { n: p.amountSats })}</span>
              </div>
              {p.memo ? <p className="payment-proposal-memo">{p.memo}</p> : null}
              {p.shoppingItemId ? (
                <p className="payment-proposal-ref">{t("payout.linkedBuy")}</p>
              ) : null}
            </div>
            {canDecide ? (
              <div className="payment-proposal-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => onApprove(p.id)}>
                  {t("payout.approve")}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onReject(p.id)}>
                  {t("payout.reject")}
                </button>
              </div>
            ) : (
              <p className="section-hint payment-proposal-wait">{t("payout.organizerOnly")}</p>
            )}
          </li>
        ))}
      </ul>

      {recent.length > 0 ? (
        <>
          <h4 className="payment-proposals-subheading">{t("payout.recentDecided")}</h4>
          <ul className="payment-proposal-list payment-proposal-list--compact">
            {recent.map((p) => (
              <li key={p.id} className={`payment-proposal-row payment-proposal-row--${p.status}`}>
                <span>{labelFor(p.fromMemberId)}</span>
                <span>{p.amountSats} sats</span>
                <span className="payment-proposal-badge">{t(`payout.status.${p.status}`)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
