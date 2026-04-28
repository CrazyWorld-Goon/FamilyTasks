'use strict';

import type { HubNetworkPeerRow } from "./hubRpc";

const PREFIX = "network-peer:" as const;

export type PeerViewTabId = `${typeof PREFIX}${string}`;

/** JSON payload stored (base64url) after the tab prefix. */
export type DecodedPeerTabPayload = {
  index: number;
  id: string;
  addr: string;
};

export function isPeerViewTab(tab: string): tab is PeerViewTabId {
  return tab.startsWith(PREFIX);
}

function utf8ToBase64Url(json: string): string {
  const binArr = new TextEncoder().encode(json);
  let latin = "";
  for (let i = 0; i < binArr.length; i++) latin += String.fromCharCode(binArr[i]);
  const b64 = btoa(latin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToUtf8(b64url: string): string {
  const padded = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const b64 = padded + "=".repeat(padLen);
  const latin = atob(b64);
  const bytes = Uint8Array.from(latin, (ch) => ch.codePointAt(0)!);
  return new TextDecoder().decode(bytes);
}

export function encodePeerViewTabId(peer: HubNetworkPeerRow, index: number): PeerViewTabId {
  const payload: DecodedPeerTabPayload = {
    index,
    id: typeof peer.id === "string" ? peer.id : "",
    addr: typeof peer.address === "string" ? peer.address : "",
  };
  const json = JSON.stringify(payload);
  return `${PREFIX}${utf8ToBase64Url(json)}`;
}

export function decodePeerViewTab(tab: string): DecodedPeerTabPayload | null {
  if (!tab.startsWith(PREFIX)) return null;
  const enc = tab.slice(PREFIX.length);
  if (!enc) return null;
  try {
    const json = base64UrlToUtf8(enc);
    const raw = JSON.parse(json) as unknown;
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    const index = typeof o.index === "number" && Number.isFinite(o.index) ? Math.floor(o.index) : NaN;
    const id = typeof o.id === "string" ? o.id : "";
    const addr = typeof o.addr === "string" ? o.addr : "";
    if (!Number.isFinite(index) || index < 0) return null;
    return { index, id, addr };
  } catch {
    return null;
  }
}

export function peerRowMatchesDecoded(p: HubNetworkPeerRow, d: DecodedPeerTabPayload): boolean {
  const pid = typeof p.id === "string" ? p.id : "";
  const addr = typeof p.address === "string" ? p.address : "";
  return pid === d.id && addr === d.addr;
}

/** Prefer index when list order matches; otherwise match id + address. */
export function findPeerForDecoded(peers: HubNetworkPeerRow[], d: DecodedPeerTabPayload): HubNetworkPeerRow | undefined {
  const at = peers[d.index];
  if (at && peerRowMatchesDecoded(at, d)) return at;
  return peers.find((p) => peerRowMatchesDecoded(p, d));
}
