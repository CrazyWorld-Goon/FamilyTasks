import { useState } from "react";
import { useI18n } from "../i18n/I18nProvider";

export function FamilySetupWizard({
  onComplete,
}: {
  onComplete: (data: {
    displayName: string;
    shortName: string;
    fullName: string;
    role: string;
    color: string;
    fabricTasksPublic: boolean;
  }) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState("");
  const [shortName, setShortName] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [color, setColor] = useState("#7b9eb8");
  const [fabricTasksPublic, setFabricTasksPublic] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const dn = displayName.trim();
    const sn = shortName.trim();
    if (!dn || !sn || submitting) return;
    setSubmitting(true);
    try {
      await Promise.resolve(
        onComplete({
          displayName: dn,
          shortName: sn,
          fullName: fullName.trim() || sn,
          role: role.trim() || t("familySetup.defaultRole"),
          color,
          fabricTasksPublic,
        }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app-shell family-setup">
      <header className="app-header">
        <div className="brand">
          <h1>{t("brand.title")}</h1>
          <p className="tagline">{t("familySetup.subtitle")}</p>
        </div>
      </header>

      <main className="family-setup-main card">
        <h2>{t("familySetup.heading")}</h2>
        <p className="section-hint">{t("familySetup.hint")}</p>
        <p className="section-hint federation-hint">{t("familySetup.federationHint")}</p>

        <form className="forms" onSubmit={submit}>
          <label>
            {t("familySetup.homeName")}
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("familySetup.homeNamePlaceholder")}
              required
              aria-label={t("familySetup.homeName")}
              autoComplete="organization"
            />
          </label>

          <h3>{t("familySetup.ownerSection")}</h3>

          <label>
            {t("familySetup.yourShortName")}
            <input
              value={shortName}
              onChange={(e) => setShortName(e.target.value)}
              placeholder={t("familySetup.shortPlaceholder")}
              required
              aria-label={t("familySetup.yourShortName")}
              autoComplete="nickname"
            />
          </label>
          <label>
            {t("familySetup.yourFullName")}
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t("familySetup.fullPlaceholder")}
              aria-label={t("familySetup.yourFullName")}
              autoComplete="name"
            />
          </label>
          <label>
            {t("familySetup.role")}
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder={t("familySetup.defaultRole")}
              aria-label={t("familySetup.role")}
            />
          </label>
          <label className="color-row">
            {t("familySetup.tabColor")}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label={t("familySetup.tabColor")} />
          </label>

          <label className="family-setup-public">
            <input
              type="checkbox"
              checked={fabricTasksPublic}
              onChange={(e) => setFabricTasksPublic(e.target.checked)}
            />
            <span>{t("familySetup.publicLabel")}</span>
          </label>
          <p className="section-hint">{t("familySetup.publicHint")}</p>

          <button
            type="submit"
            className="btn btn-primary family-setup-submit"
            disabled={submitting}
            aria-busy={submitting}
          >
            {submitting ? `${t("familySetup.submit")}…` : t("familySetup.submit")}
          </button>
        </form>
      </main>
    </div>
  );
}
