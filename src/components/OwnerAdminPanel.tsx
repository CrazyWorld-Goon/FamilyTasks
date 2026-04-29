import { useEffect, useId } from "react";
import { useI18n } from "../i18n/I18nProvider";
import type { FabricActorId } from "../fabricIds";
import { downloadStoredOwnerTokenBackup } from "../fabricTokenClient";
import type { FamilyMember, PaymentProposal } from "../types";
import { IconClose, IconNetwork, IconShield } from "./Icons";
import { PaymentProposalsPanel } from "./PaymentProposalsPanel";
import { WalletSummaryCard } from "./WalletSummaryCard";
import { BitcoinToolsCard } from "./BitcoinToolsCard";

export function OwnerAdminPanel({
  open,
  onClose,
  ownerUserId,
  ownerShortName,
  displayName,
  fabricTasksPublic,
  onFabricTasksPublicChange,
  bitcoinFeaturesEnabled,
  onBitcoinFeaturesChange,
  onGoToNetwork,
  paymentProposals,
  members,
  canDecideProposals,
  onApproveProposal,
  onRejectProposal,
}: {
  open: boolean;
  onClose: () => void;
  ownerUserId: FabricActorId;
  ownerShortName: string;
  displayName?: string;
  fabricTasksPublic: boolean;
  onFabricTasksPublicChange: (next: boolean) => void;
  bitcoinFeaturesEnabled: boolean;
  onBitcoinFeaturesChange: (next: boolean) => void;
  onGoToNetwork: () => void;
  paymentProposals: PaymentProposal[];
  members: FamilyMember[];
  canDecideProposals: boolean;
  onApproveProposal: (id: string) => void;
  onRejectProposal: (id: string) => void;
}) {
  const { t } = useI18n();
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const onDownload = () => {
    downloadStoredOwnerTokenBackup(ownerUserId);
  };

  return (
    <div className="owner-admin-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="owner-admin-panel card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="owner-admin-panel-header">
          <h2 id={titleId} className="owner-admin-panel-title">
            <IconShield size={22} className="owner-admin-panel-title-icon" aria-hidden />
            {t("adminPanel.title")}
          </h2>
          <button type="button" className="btn btn-ghost owner-admin-close" onClick={onClose} aria-label={t("adminPanel.closeAria")}>
            <IconClose size={22} />
          </button>
        </div>
        <p className="section-hint owner-admin-intro">{t("adminPanel.intro")}</p>

        <div className="owner-admin-section">
          <h3 className="owner-admin-section-heading">{t("adminPanel.householdHeading")}</h3>
          <p className="owner-admin-detail">
            <strong>{t("adminPanel.homeName")}</strong> {displayName?.trim() || "—"}
          </p>
          <p className="owner-admin-detail">
            <strong>{t("adminPanel.organizer")}</strong> {ownerShortName}
          </p>
        </div>

        <div className="owner-admin-section">
          <h3 className="owner-admin-section-heading">{t("adminPanel.networkHeading")}</h3>
          <p className="section-hint">{t("adminPanel.networkHint")}</p>
          <label className="owner-admin-checkbox fabric-public-label">
            <input
              type="checkbox"
              checked={fabricTasksPublic}
              onChange={(e) => onFabricTasksPublicChange(e.target.checked)}
            />
            <span>{t("network.publicLabel")}</span>
          </label>
          <p className="section-hint owner-admin-subhint">{t("network.publicHint")}</p>
          <label className="owner-admin-checkbox fabric-public-label">
            <input
              type="checkbox"
              checked={bitcoinFeaturesEnabled}
              onChange={(e) => onBitcoinFeaturesChange(e.target.checked)}
            />
            <span>{t("adminPanel.bitcoinFeaturesLabel")}</span>
          </label>
          <p className="section-hint owner-admin-subhint">{t("adminPanel.bitcoinFeaturesHint")}</p>
          <button
            type="button"
            className="btn btn-secondary owner-admin-action"
            onClick={() => {
              onGoToNetwork();
              onClose();
            }}
          >
            <IconNetwork size={18} />
            {t("adminPanel.openNetwork")}
          </button>
        </div>

        <div className="owner-admin-section">
          <h3 className="owner-admin-section-heading">{t("adminPanel.securityHeading")}</h3>
          <p className="section-hint">{t("adminPanel.securityHint")}</p>
          <button type="button" className="btn btn-secondary owner-admin-action" onClick={onDownload}>
            {t("adminPanel.downloadToken")}
          </button>
        </div>

        <div className="owner-admin-scroll-section">
          <PaymentProposalsPanel
            proposals={paymentProposals}
            members={members}
            ownerUserId={ownerUserId}
            canDecide={canDecideProposals}
            onApprove={onApproveProposal}
            onReject={onRejectProposal}
          />
        </div>

        <BitcoinToolsCard className="owner-admin-bitcoin-tools" />

        <WalletSummaryCard className="owner-admin-wallet-card owner-admin-wallet-card--bottom" />
      </aside>
    </div>
  );
}
