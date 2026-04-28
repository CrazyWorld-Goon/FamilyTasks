'use strict';

import { useCallback, useEffect, useState } from "react";
import { IconNetwork } from "./Icons";
import { useI18n } from "../i18n/I18nProvider";
import {
  hubGetNetworkStatus,
  isHubPeerLikelyConnected,
  type HubNetworkPeerRow,
} from "../hubRpc";
import { decodePeerViewTab, findPeerForDecoded, type PeerViewTabId } from "../networkPeerTab";

const PEER_POLL_MS = 8000;

export type PeerViewProps = {
  tabId: PeerViewTabId;
  hubAddress?: string;
  onBack: () => void;
};

export default function PeerView({ tabId, hubAddress, onBack }: PeerViewProps) {
  const { t } = useI18n();
  const decoded = decodePeerViewTab(tabId);

  const [peers, setPeers] = useState<HubNetworkPeerRow[]>([]);
  const [peerPollError, setPeerPollError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshPeers = useCallback(async () => {
    const r = await hubGetNetworkStatus();
    if (!r.ok) {
      setPeerPollError(r.message);
      setLoading(false);
      return;
    }
    setPeerPollError(null);
    const list = Array.isArray(r.result.peers) ? r.result.peers : [];
    setPeers(list.filter((x) => x && typeof x === "object") as HubNetworkPeerRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refreshPeers();
    const id = window.setInterval(() => void refreshPeers(), PEER_POLL_MS);
    return () => window.clearInterval(id);
  }, [refreshPeers]);

  if (!decoded) {
    return (
      <div className="peer-view">
        <div className="peer-view-toolbar">
          <button type="button" className="btn btn-ghost peer-view-back" onClick={onBack}>
            {t("network.peerViewBack")}
          </button>
        </div>
        <p className="section-hint" role="alert">
          {t("network.peerViewInvalid")}
        </p>
      </div>
    );
  }

  const peer = findPeerForDecoded(peers, decoded);
  const title =
    decoded?.addr.trim()
      ? decoded.addr
      : decoded?.id.trim()
        ? decoded.id
        : t("network.peerDetailHeading");
  const rawStatus = peer ? String(peer.status || "").trim() || "—" : "—";
  const connected = peer ? isHubPeerLikelyConnected(peer) : false;

  const showStale = Boolean(decoded && !loading && !peerPollError && !peer);

  return (
    <div className="peer-view">
      <div className="peer-view-toolbar">
        <button type="button" className="btn btn-ghost peer-view-back" onClick={onBack}>
          {t("network.peerViewBack")}
        </button>
      </div>

      <h2 className="peer-view-title">
        <IconNetwork size={18} /> {title}
      </h2>
      {hubAddress ? (
        <p className="fabric-network-target section-hint">
          Hub <code>{hubAddress}</code>
        </p>
      ) : null}

      {peerPollError ? (
        <p className="fabric-network-peer-error" role="alert">
          {t("network.peersLoadError")}
        </p>
      ) : null}

      {showStale ? (
        <p className="section-hint peer-view-missing">{t("network.peerViewStale")}</p>
      ) : null}

      {!peer ? null : (
        <div className="fabric-peer-detail fabric-peer-detail--page" aria-label={t("network.peerDetailAria")}>
          <div className="fabric-peer-detail-connectivity">
            <span
              className={
                connected ? "fabric-peer-pill fabric-peer-pill--on" : "fabric-peer-pill fabric-peer-pill--off"
              }
            >
              {connected ? t("network.peerConnected") : t("network.peerNotConnected")}
            </span>
            <span className="fabric-peer-raw-status fabric-peer-raw-status--detail" title={rawStatus}>
              {rawStatus}
            </span>
          </div>
          <dl className="fabric-peer-detail-dl">
            <div>
              <dt>{t("network.peerColId")}</dt>
              <dd>
                <code className="fabric-peer-detail-mono">{typeof peer.id === "string" ? peer.id : "—"}</code>
              </dd>
            </div>
            <div>
              <dt>{t("network.peerColAddress")}</dt>
              <dd>
                <code className="fabric-peer-detail-mono">{typeof peer.address === "string" ? peer.address : "—"}</code>
              </dd>
            </div>
            <div>
              <dt>{t("network.peerColStatus")}</dt>
              <dd>
                <code className="fabric-peer-detail-mono">{String(peer.status || "").trim() || "—"}</code>
              </dd>
            </div>
            {typeof peer.score === "number" && Number.isFinite(peer.score) ? (
              <div>
                <dt>{t("network.peerDetailScore")}</dt>
                <dd>{peer.score}</dd>
              </div>
            ) : null}
          </dl>
          <div className="fabric-peer-detail-meta">
            <div className="fabric-peer-detail-meta-label">{t("network.peerDetailMetadata")}</div>
            {peer.metadata &&
            typeof peer.metadata === "object" &&
            Object.keys(peer.metadata).length > 0 ? (
              <pre className="fabric-peer-detail-pre">{JSON.stringify(peer.metadata, null, 2)}</pre>
            ) : (
              <p className="section-hint fabric-peer-detail-empty">{t("network.peerDetailMetadataEmpty")}</p>
            )}
          </div>
        </div>
      )}

      <button type="button" className="btn btn-secondary fabric-network-refresh-peers" onClick={() => void refreshPeers()}>
        {t("network.peersRefresh")}
      </button>
    </div>
  );
}
