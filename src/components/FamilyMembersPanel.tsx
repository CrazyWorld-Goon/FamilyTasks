"use strict";

import { useCallback, useState, type FormEvent } from "react";
import type { FamilyMember } from "../types";
import { useI18n } from "../i18n/I18nProvider";
import { memberRoleLabel } from "../i18n/memberRole";
import { IconTrash, IconPlus } from "./Icons";

export function FamilyMembersPanel({
  members,
  onAdd,
  onRemove,
}: {
  members: FamilyMember[];
  onAdd: (input: Omit<FamilyMember, "id"> & { id?: string }) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useI18n();
  const [shortName, setShortName] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [color, setColor] = useState("#7b9eb8");

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
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              disabled={members.length <= 1}
              title={members.length <= 1 ? t("users.cannotRemoveLast") : t("users.remove")}
              onClick={() => onRemove(m.id)}
            >
              <IconTrash size={16} />
            </button>
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
    </div>
  );
}
