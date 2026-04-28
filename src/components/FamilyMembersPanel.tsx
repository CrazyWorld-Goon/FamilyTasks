"use strict";

import { useCallback, useState, type FormEvent } from "react";
import type { FamilyMember } from "../types";
import { useI18n } from "../i18n/I18nProvider";
import { memberRoleLabel } from "../i18n/memberRole";
import { IconTrash, IconPlus, IconPencil } from "./Icons";

export function FamilyMembersPanel({
  members,
  onAdd,
  onUpdate,
  onRemove,
}: {
  members: FamilyMember[];
  onAdd: (input: Omit<FamilyMember, "id"> & { id?: string }) => void;
  onUpdate: (id: string, patch: { shortName: string; fullName: string; role: string; color: string }) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useI18n();
  const [shortName, setShortName] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [color, setColor] = useState("#7b9eb8");
  const [removeConfirm, setRemoveConfirm] = useState<FamilyMember | null>(null);
  const [editMember, setEditMember] = useState<FamilyMember | null>(null);
  const [editShortName, setEditShortName] = useState("");
  const [editFullName, setEditFullName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editColor, setEditColor] = useState("#7b9eb8");

  const submit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const sn = shortName.trim();
      const fn = fullName.trim();
      const rl = role.trim();
      if (!sn || !fn || !rl) return;
      onAdd({ shortName: sn, fullName: fn, role: rl, color });
      setShortName("");
      setFullName("");
      setRole("");
      setColor("#7b9eb8");
    },
    [shortName, fullName, role, color, onAdd],
  );

  const openEdit = useCallback((member: FamilyMember) => {
    setEditMember(member);
    setEditShortName(member.shortName);
    setEditFullName(member.fullName);
    setEditRole(member.role);
    setEditColor(member.color);
  }, []);

  const submitEdit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!editMember) return;
      onUpdate(editMember.id, {
        shortName: editShortName,
        fullName: editFullName,
        role: editRole,
        color: editColor,
      });
      setEditMember(null);
    },
    [editMember, editShortName, editFullName, editRole, editColor, onUpdate],
  );

  return (
    <div className="card family-members-card">
      <h2>{t("users.heading")}</h2>
      <p className="section-hint">{t("users.hint")}</p>
      <ul className="family-members-list">
        {members.map((m) => (
          <li key={m.id} className="family-members-row" style={{ borderLeft: `4px solid ${m.color}` }}>
            <div className="family-members-meta">
              <strong>{m.shortName}</strong>
              <span className="badge">{memberRoleLabel(t, m)}</span>
              <span className="muted">{m.fullName}</span>
            </div>
            <div className="family-members-actions">
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                title={t("users.edit")}
                aria-label={t("users.edit")}
                onClick={() => openEdit(m)}
              >
                <IconPencil size={16} />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                disabled={members.length <= 1}
                title={members.length <= 1 ? t("users.cannotRemoveLast") : t("users.remove")}
                onClick={() => setRemoveConfirm(m)}
              >
                <IconTrash size={16} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <form className="forms family-members-form" onSubmit={submit}>
        <div className="input-row family-members-add-row">
          <input
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            placeholder={t("users.shortName")}
            aria-label={t("users.shortName")}
            required
          />
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={t("users.fullName")}
            aria-label={t("users.fullName")}
            required
          />
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder={t("users.role")}
            aria-label={t("users.role")}
            required
          />
          <input
            type="color"
            value={color.length === 4 || color.length === 7 ? color : "#7b9eb8"}
            onChange={(e) => setColor(e.target.value)}
            aria-label={t("users.color")}
            className="family-members-color"
          />
          <button type="submit" className="btn btn-secondary">
            <IconPlus size={16} /> {t("users.add")}
          </button>
        </div>
      </form>

      {removeConfirm ? (
        <div className="confirm-backdrop" role="presentation" onClick={() => setRemoveConfirm(null)}>
          <div
            className="confirm-dialog card"
            role="dialog"
            aria-modal="true"
            aria-label={t("users.removeConfirmTitle")}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{t("users.removeConfirmTitle")}</h3>
            <p className="section-hint">{t("users.removeConfirmBody", { name: removeConfirm.fullName })}</p>
            <div className="confirm-actions">
              <button
                type="button"
                className="btn btn-cancel-done"
                onClick={() => {
                  onRemove(removeConfirm.id);
                  setRemoveConfirm(null);
                }}
              >
                {t("users.remove")}
              </button>
              <button type="button" className="btn btn-keep-done" onClick={() => setRemoveConfirm(null)}>
                {t("users.removeConfirmKeep")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editMember ? (
        <div className="confirm-backdrop" role="presentation" onClick={() => setEditMember(null)}>
          <div
            className="confirm-dialog card"
            role="dialog"
            aria-modal="true"
            aria-label={t("users.editTitle")}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{t("users.editTitle")}</h3>
            <form className="forms family-members-edit-form" onSubmit={submitEdit}>
              <label className="family-profile-field">
                <span className="family-profile-label">{t("users.shortName")}</span>
                <input value={editShortName} onChange={(e) => setEditShortName(e.target.value)} required />
              </label>
              <label className="family-profile-field">
                <span className="family-profile-label">{t("users.fullName")}</span>
                <input value={editFullName} onChange={(e) => setEditFullName(e.target.value)} required />
              </label>
              <label className="family-profile-field">
                <span className="family-profile-label">{t("users.role")}</span>
                <input value={editRole} onChange={(e) => setEditRole(e.target.value)} required />
              </label>
              <label className="family-profile-field">
                <span className="family-profile-label">{t("users.color")}</span>
                <input
                  type="color"
                  value={editColor.length === 4 || editColor.length === 7 ? editColor : "#7b9eb8"}
                  onChange={(e) => setEditColor(e.target.value)}
                  className="family-members-color"
                />
              </label>
              <div className="confirm-actions">
                <button type="submit" className="btn btn-cancel-done">
                  {t("users.saveEdit")}
                </button>
                <button type="button" className="btn btn-keep-done" onClick={() => setEditMember(null)}>
                  {t("users.cancelEdit")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
