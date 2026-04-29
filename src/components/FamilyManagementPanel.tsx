"use strict";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import type { FabricActorId } from "../fabricIds";
import { ALL_DAY_PHASES_ORDERED } from "../logic/shoppingAllTabPhases";
import type { DayPhase, FamilyMember, PaymentProposal } from "../types";
import { useI18n } from "../i18n/I18nProvider";
import { IconHouse } from "./Icons";
import { FamilyMembersPanel } from "./FamilyMembersPanel";
import { PaymentProposalsPanel } from "./PaymentProposalsPanel";
import { WalletSummaryCard } from "./WalletSummaryCard";
import { BitcoinToolsCard } from "./BitcoinToolsCard";

export function FamilyManagementPanel({
  displayName,
  description,
  members,
  onSaveProfile,
  onAddMember,
  onUpdateMember,
  onReorderMembers,
  onRemoveMember,
  paymentProposals,
  ownerUserId,
  canDecideProposals,
  onApproveProposal,
  onRejectProposal,
  shoppingVisiblePhasesAllTab,
  onSetShoppingVisiblePhasesAllTab,
}: {
  displayName: string;
  description: string;
  members: FamilyMember[];
  onSaveProfile: (next: { displayName: string; description: string }) => void;
  onAddMember: (input: Omit<FamilyMember, "id"> & { id?: string }) => void;
  onUpdateMember: (id: string, patch: { shortName: string; fullName: string; role: string; color: string }) => void;
  onReorderMembers: (fromIndex: number, toIndex: number) => void;
  onRemoveMember: (id: string) => void;
  shoppingVisiblePhasesAllTab: DayPhase[];
  onSetShoppingVisiblePhasesAllTab: (phases: DayPhase[]) => void;
  paymentProposals: PaymentProposal[];
  ownerUserId?: FabricActorId;
  canDecideProposals: boolean;
  onApproveProposal: (id: string) => void;
  onRejectProposal: (id: string) => void;
}) {
  const { t } = useI18n();
  const [nameDraft, setNameDraft] = useState(displayName);
  const [descDraft, setDescDraft] = useState(description);

  useEffect(() => {
    setNameDraft(displayName);
  }, [displayName]);

  useEffect(() => {
    setDescDraft(description);
  }, [description]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSaveProfile({ displayName: nameDraft, description: descDraft });
  };

  const toggleShoppingPhase = useCallback(
    (phase: DayPhase) => {
      const set = new Set(shoppingVisiblePhasesAllTab);
      if (set.has(phase)) set.delete(phase);
      else set.add(phase);
      onSetShoppingVisiblePhasesAllTab(ALL_DAY_PHASES_ORDERED.filter((p) => set.has(p)));
    },
    [shoppingVisiblePhasesAllTab, onSetShoppingVisiblePhasesAllTab],
  );

  return (
    <section className="family-management" aria-label={t("familyManage.aria")}>
      <div className="card">
        <h2>
          <IconHouse size={18} /> {t("familyManage.heading")}
        </h2>
        <p className="section-hint">{t("familyManage.intro")}</p>
        <form className="forms family-profile-form" onSubmit={onSubmit}>
          <label className="family-profile-field">
            <span className="family-profile-label">{t("familyManage.displayNameLabel")}</span>
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder={t("familyManage.displayNamePlaceholder")}
              autoComplete="organization"
              aria-label={t("familyManage.displayNameLabel")}
            />
          </label>
          <label className="family-profile-field">
            <span className="family-profile-label">{t("familyManage.descriptionLabel")}</span>
            <textarea
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              placeholder={t("familyManage.descriptionPlaceholder")}
              rows={4}
              aria-label={t("familyManage.descriptionLabel")}
            />
          </label>
          <div className="family-profile-actions">
            <button type="submit" className="btn btn-primary">
              {t("familyManage.saveProfile")}
            </button>
          </div>
        </form>
      </div>

      <PaymentProposalsPanel
        proposals={paymentProposals}
        members={members}
        ownerUserId={ownerUserId}
        canDecide={canDecideProposals}
        onApprove={onApproveProposal}
        onReject={onRejectProposal}
      />

      <div className="card shopping-all-tab-phases-card">
        <h2>{t("familyManage.shoppingPhasesHeading")}</h2>
        <p className="section-hint">{t("familyManage.shoppingPhasesHint")}</p>
        <div className="task-manage-member-pills shopping-all-tab-phase-pills" role="group" aria-label={t("familyManage.shoppingPhasesAria")}>
          {ALL_DAY_PHASES_ORDERED.map((phase) => {
            const selected = shoppingVisiblePhasesAllTab.includes(phase);
            return (
              <button
                key={phase}
                type="button"
                className={selected ? "btn btn-primary task-request-member-btn" : "btn btn-ghost task-request-member-btn"}
                aria-pressed={selected}
                onClick={() => toggleShoppingPhase(phase)}
              >
                {t(`phase.${phase}`)}
              </button>
            );
          })}
        </div>
      </div>

      <FamilyMembersPanel
        members={members}
        onAdd={onAddMember}
        onUpdate={onUpdateMember}
        onReorderMembers={onReorderMembers}
        onRemove={onRemoveMember}
      />

      <BitcoinToolsCard />

      <WalletSummaryCard />
    </section>
  );
}
