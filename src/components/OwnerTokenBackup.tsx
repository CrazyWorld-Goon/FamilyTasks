import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import type { FabricActorId } from "../fabricIds";
import {
  type FabricOwnerTokenEnvelope,
  getStoredFabricOwnerToken,
  issueOwnerTokenWithRetry,
  storeFabricOwnerToken,
} from "../fabricTokenClient";

type Phase = "loading" | "ready" | "error";

export function OwnerTokenBackup({
  ownerUserId,
  onAcknowledge,
}: {
  ownerUserId: FabricActorId;
  onAcknowledge: () => void;
}) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>("loading");
  const [envelope, setEnvelope] = useState<FabricOwnerTokenEnvelope | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const existing = getStoredFabricOwnerToken();
      if (existing?.userId === ownerUserId) {
        setEnvelope(existing.envelope);
        setPhase("ready");
        return;
      }
      setPhase("loading");
      const r = await issueOwnerTokenWithRetry(ownerUserId);
      if (cancelled) return;
      if (r.ok) {
        storeFabricOwnerToken(ownerUserId, r.envelope);
        setEnvelope(r.envelope);
        setPhase("ready");
      } else {
        setPhase("error");
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [ownerUserId, retryCount]);

  const downloadJson = useCallback(() => {
    if (!envelope) return;
    const blob = new Blob([JSON.stringify(envelope, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `familytasks-owner-token-${ownerUserId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [envelope, ownerUserId]);

  return (
    <div className="app-shell family-setup owner-token-backup">
      <header className="app-header">
        <div className="brand">
          <h1>{t("brand.title")}</h1>
          <p className="tagline">{t("ownerToken.subtitle")}</p>
        </div>
      </header>

      <main className="family-setup-main card">
        <h2>{t("ownerToken.heading")}</h2>
        <p className="section-hint">{t("ownerToken.body")}</p>
        <p className="section-hint federation-hint">{t("ownerToken.offlineHint")}</p>

        {phase === "loading" ? (
          <p className="owner-token-status" role="status">
            {t("ownerToken.loading")}
          </p>
        ) : null}

        {phase === "error" ? (
          <div className="owner-token-error">
            <p>{t("ownerToken.error")}</p>
            <p className="section-hint">{t("ownerToken.errorHint")}</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setRetryCount((n) => n + 1)}
            >
              {t("ownerToken.retry")}
            </button>
          </div>
        ) : null}

        {phase === "ready" && envelope ? (
          <div className="owner-token-actions">
            <button type="button" className="btn btn-secondary" onClick={downloadJson}>
              {t("ownerToken.download")}
            </button>
            <button type="button" className="btn btn-primary" onClick={onAcknowledge}>
              {t("ownerToken.confirm")}
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
}
