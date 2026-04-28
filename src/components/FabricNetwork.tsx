import { useEffect, useMemo, useState } from "react";

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

export type FabricNetworkProps = {
  /** e.g. `127.0.0.1:8080` — Hub HTTP port in dev (not Vite). Omit to use `window.location.host`. */
  hubAddress?: string;
  /** Show WebSocket URL + connection status (similar idea to Bridge `debug`). */
  showDebug?: boolean;
};

export default function FabricNetwork({ hubAddress, showDebug = true }: FabricNetworkProps) {
  const wsOrigin = useMemo(() => parseHubWsOrigin(hubAddress?.trim()), [hubAddress]);
  const [phase, setPhase] = useState<"idle" | "connecting" | "open" | "closed" | "error">("idle");

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

  const label = hubAddress?.trim() || window.location.host;

  return (
    <div className="fabric-network-panel">
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
              ws <code>{websocketUrl("/", wsOrigin)}</code>
            </div>
          ) : (
            <p className="fabric-network-debug-hint section-hint">Invalid hub address.</p>
          )}
          <p className="fabric-network-debug-hint section-hint">
            Full WebRTC peering uses Hub signaling over this socket (same surface as Hub Bridge, without bundling Hub UI).
          </p>
        </div>
      ) : null}
    </div>
  );
}
