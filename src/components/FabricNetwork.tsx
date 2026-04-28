'use strict';

import { useCallback, useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { useI18n } from "../i18n/I18nProvider";
import {
  hubAddPeer,
  hubGetNetworkStatus,
  isHubPeerLikelyConnected,
  type HubNetworkPeerRow,
} from "../hubRpc";

/**
 * Lightweight Fabric Hub WebSocket session (same URL rules as `@fabric/hub/components/Bridge`).
 * We avoid importing Hub’s Bridge here — its dependency graph emits bare `require()` in Vite/Rollup output,
 * which breaks in the browser (`require is not defined`).
 */

function parseHubWsOrigin(input: string | undefined): string | null {
  const raw = input?.trim();
  if (!raw) {
    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProto}//${window.location.host}`;
  }
  try {
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw);
    const url = new URL(hasScheme ? raw : `http://${raw}`);
    const secure = url.protocol === "https:" || url.protocol === "wss:";
    const wsProto = secure ? "wss:" : "ws:";
    const host = url.hostname;
    const port = url.port || (secure ? "443" : "80");
    return `${wsProto}//${host}:${port}`;
  } catch {
    return null;
  }
}

function websocketUrl(path: string, wsOrigin: string): string {
  const base = `${wsOrigin.replace(/\/?$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  try {
    const token =
      typeof window !== "undefined" &&
      typeof (window as unknown as { FABRIC_WS_CLIENT_TOKEN?: string }).FABRIC_WS_CLIENT_TOKEN === "string"
        ? String((window as unknown as { FABRIC_WS_CLIENT_TOKEN?: string }).FABRIC_WS_CLIENT_TOKEN).trim()
        : "";
    if (!token) return base;
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}token=${encodeURIComponent(token)}`;
  } catch {
    return base;
  }
}

/** Same as {@link websocketUrl} but hides query params (e.g. token) in UI. */
function websocketUrlForDisplay(path: string, wsOrigin: string): string {
  const full = websocketUrl(path, wsOrigin);
  const q = full.indexOf("?");
  return q >= 0 ? `${full.slice(0, q)}?[REDACTED]` : full;
}

export type FabricNetworkProps = {
  /** e.g. `127.0.0.1:8080` — Hub HTTP port in dev (not Vite). Omit to use `window.location.host`. */
  hubAddress?: string;
  /** Show WebSocket URL + connection status (similar idea to Bridge `debug`). */
  showDebug?: boolean;
  /** Poll Hub JSON-RPC for known peers (requires same-origin or dev proxy to `/services/rpc`). */
  showPeers?: boolean;
  /** Opens the dedicated peer details view (Network tab only). */
  onOpenPeer?: (peer: HubNetworkPeerRow, index: number) => void;
  /** Primary organizer: publish tasks to the Fabric network for cross-family completion. */
  fabricTasksPublic?: boolean;
  onFabricTasksPublicChange?: (next: boolean) => void;
};

const PEER_POLL_MS = 8000;

export default function FabricNetwork({
  hubAddress,
  showDebug = true,
  showPeers = true,
  onOpenPeer,
  fabricTasksPublic,
  onFabricTasksPublicChange,
}: FabricNetworkProps) {
  const { t } = useI18n();
  const wsOrigin = useMemo(() => parseHubWsOrigin(hubAddress?.trim()), [hubAddress]);
  const [phase, setPhase] = useState<"idle" | "connecting" | "open" | "closed" | "error">("idle");

  const [peers, setPeers] = useState<HubNetworkPeerRow[]>([]);
  const [peerPollError, setPeerPollError] = useState<string | null>(null);
  const [addAddress, setAddAddress] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addMessage, setAddMessage] = useState<string | null>(null);

  const refreshPeers = useCallback(async () => {
    const r = await hubGetNetworkStatus();
    if (!r.ok) {
      setPeerPollError(r.message);
      return;
    }
    setPeerPollError(null);
    const list = Array.isArray(r.result.peers) ? r.result.peers : [];
    setPeers(list.filter((x) => x && typeof x === "object") as HubNetworkPeerRow[]);
  }, []);

  useEffect(() => {
    if (!wsOrigin) {
      setPhase("error");
      return;
    }

    const url = websocketUrl("/", wsOrigin);
    setPhase("connecting");
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => setPhase("open");
    ws.onclose = () => setPhase("closed");
    ws.onerror = () => setPhase("error");

    return () => {
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      try {
        ws.close();
      } catch {
        /* noop */
      }
    };
  }, [wsOrigin]);

  useEffect(() => {
    if (!showPeers) return;
    void refreshPeers();
    const id = window.setInterval(() => void refreshPeers(), PEER_POLL_MS);
    return () => window.clearInterval(id);
  }, [showPeers, refreshPeers]);

  const onAddPeerSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const raw = addAddress.trim();
      if (!raw || addBusy) return;
      setAddBusy(true);
      setAddMessage(null);
      const r = await hubAddPeer(raw);
      setAddBusy(false);
      if (!r.ok) {
        setAddMessage(t("network.addPeerError"));
        return;
      }
      setAddMessage(t("network.addPeerOk"));
      setAddAddress("");
      void refreshPeers();
    },
    [addAddress, addBusy, refreshPeers, t],
  );

  const label = hubAddress?.trim() || window.location.host;

  const onPeerRowActivate = useCallback(
    (index: number, peer: HubNetworkPeerRow) => {
      onOpenPeer?.(peer, index);
    },
    [onOpenPeer],
  );

  const onPeerRowKeyDown = useCallback(
    (e: KeyboardEvent, index: number, peer: HubNetworkPeerRow) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onPeerRowActivate(index, peer);
      }
    },
    [onPeerRowActivate],
  );

  const showPublicToggle =
    typeof fabricTasksPublic === "boolean" && typeof onFabricTasksPublicChange === "function";

  return (
    <div className="fabric-network-panel">
      {showPublicToggle ? (
        <div className="fabric-public-setting">
          <label className="fabric-public-label">
            <input
              type="checkbox"
              checked={fabricTasksPublic}
              onChange={(e) => onFabricTasksPublicChange(e.target.checked)}
            />
            <span>{t("network.publicLabel")}</span>
          </label>
          <p className="section-hint fabric-public-hint">{t("network.publicHint")}</p>
        </div>
      ) : null}
      {showDebug ? (
        <div className="fabric-network-debug">
          <div>
            <strong>Fabric Hub WebSocket:</strong>{" "}
            {phase === "open" ? "connected" : phase === "connecting" ? "connecting…" : phase === "error" ? "error" : "disconnected"}
          </div>
          <div className="fabric-network-debug-meta">
            target <code>{label}</code>
          </div>
          {wsOrigin ? (
            <div className="fabric-network-debug-meta">
              ws <code>{websocketUrlForDisplay("/", wsOrigin)}</code>
            </div>
          ) : (
            <p className="fabric-network-debug-hint section-hint">Invalid hub address.</p>
          )}
          <p className="fabric-network-debug-hint section-hint">
            Full WebRTC peering uses Hub signaling over this socket (same surface as Hub Bridge, without bundling Hub UI).
          </p>
        </div>
      ) : null}

      {showPeers ? (
        <div className="fabric-network-peers">
          <h3 className="fabric-network-peers-heading">{t("network.peersHeading")}</h3>
          <p className="section-hint">{t("network.peersHint")}</p>

          <form className="fabric-network-add-peer forms" onSubmit={onAddPeerSubmit}>
            <label className="fabric-network-add-label">
              <span className="visually-hidden">{t("network.addPeerLabel")}</span>
              <input
                value={addAddress}
                onChange={(e) => setAddAddress(e.target.value)}
                placeholder={t("network.addPeerPlaceholder")}
                autoComplete="off"
                disabled={addBusy}
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={addBusy || !addAddress.trim()}>
              {addBusy ? `${t("network.addPeerSubmit")}…` : t("network.addPeerSubmit")}
            </button>
          </form>
          {addMessage ? <p className="fabric-network-add-msg">{addMessage}</p> : null}

          {peerPollError ? (
            <p className="fabric-network-peer-error" role="alert">
              {t("network.peersLoadError")}
            </p>
          ) : peers.length === 0 ? (
            <p className="empty fabric-network-peers-empty">{t("network.peersEmpty")}</p>
          ) : (
            <div className="fabric-peer-table-wrap">
              <table className="fabric-peer-table">
                <thead>
                  <tr>
                    <th scope="col">{t("network.peerColId")}</th>
                    <th scope="col">{t("network.peerColAddress")}</th>
                    <th scope="col">{t("network.peerColStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {peers.map((p, i) => {
                    const pid = typeof p.id === "string" && p.id ? p.id : `peer-${i}`;
                    const addr = typeof p.address === "string" ? p.address : "—";
                    const connected = isHubPeerLikelyConnected(p);
                    const rawStatus = String(p.status || "").trim() || "—";
                    const interactive = Boolean(onOpenPeer);
                    return (
                      <tr
                        key={`${pid}-${addr}-${i}`}
                        className={`fabric-peer-row${interactive ? " fabric-peer-row--interactive" : ""}`}
                        tabIndex={interactive ? 0 : undefined}
                        aria-label={t("network.peerRowAria", { id: pid, address: addr })}
                        onClick={interactive ? () => onPeerRowActivate(i, p) : undefined}
                        onKeyDown={
                          interactive ? (e) => onPeerRowKeyDown(e, i, p) : undefined
                        }
                      >
                        <td className="fabric-peer-cell fabric-peer-cell-id">
                          <code title={pid}>{pid.length > 20 ? `${pid.slice(0, 10)}…${pid.slice(-6)}` : pid}</code>
                        </td>
                        <td className="fabric-peer-cell">
                          <code>{addr}</code>
                        </td>
                        <td className="fabric-peer-cell">
                          <span
                            className={
                              connected ? "fabric-peer-pill fabric-peer-pill--on" : "fabric-peer-pill fabric-peer-pill--off"
                            }
                          >
                            {connected ? t("network.peerConnected") : t("network.peerNotConnected")}
                          </span>
                          <span className="fabric-peer-raw-status" title={rawStatus}>
                            {rawStatus}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {peerPollError || peers.length === 0 || !onOpenPeer ? null : (
            <p className="section-hint fabric-peer-select-hint">{t("network.peerSelectHint")}</p>
          )}

          <button type="button" className="btn btn-secondary fabric-network-refresh-peers" onClick={() => void refreshPeers()}>
            {t("network.peersRefresh")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
