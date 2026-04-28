/**
 * Fabric Hub HTTP JSON-RPC (same convention as `@fabric/hub/functions/hydrateHubNetworkStatusViaHttp`).
 */

export function getServicesRpcUrl(): string {
  const base = import.meta.env.BASE_URL || "/";
  const normalized = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${normalized}/services/rpc`;
}

/** Minimal subset of Hub {@link GetNetworkStatus} peer rows (TCP + merged WebRTC summaries). */
export type HubNetworkPeerRow = {
  id?: string;
  address?: string;
  status?: string;
  metadata?: Record<string, unknown>;
  score?: number;
};

export type HubGetNetworkStatusResult = {
  peers?: HubNetworkPeerRow[];
  network?: { address?: string; listening?: boolean };
};

let rpcSeq = 0;

export async function hubJsonRpc<T>(method: string, params: unknown[] = []): Promise<{ ok: true; result: T } | { ok: false; message: string; httpStatus?: number }> {
  const url = getServicesRpcUrl();
  rpcSeq += 1;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: rpcSeq, method, params }),
    });
  } catch {
    return { ok: false, message: "network" };
  }
  const raw: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, message: `http ${res.status}`, httpStatus: res.status };
  }
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (body?.error != null) {
    const err = body.error && typeof body.error === "object" ? (body.error as Record<string, unknown>) : null;
    const msg = err && typeof err.message === "string" ? err.message : "rpc_error";
    return { ok: false, message: msg };
  }
  if (body?.result !== undefined) {
    return { ok: true, result: body.result as T };
  }
  return { ok: false, message: "invalid_rpc_response" };
}

export async function hubGetNetworkStatus(): Promise<
  { ok: true; result: HubGetNetworkStatusResult } | { ok: false; message: string }
> {
  const r = await hubJsonRpc<HubGetNetworkStatusResult>("GetNetworkStatus", []);
  if (!r.ok) return r;
  return { ok: true, result: r.result };
}

export async function hubAddPeer(addressRaw: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const trimmed = addressRaw.trim();
  if (!trimmed) return { ok: false, message: "empty_address" };
  const normalized = trimmed.includes(":") ? trimmed : `${trimmed}:7777`;
  const r = await hubJsonRpc<{ status?: string; message?: string }>("AddPeer", [{ address: normalized }]);
  if (!r.ok) return { ok: false, message: r.message };
  const st = r.result?.status;
  if (st === "error") return { ok: false, message: String(r.result?.message || "add_peer_failed") };
  return { ok: true };
}

export function isHubPeerLikelyConnected(p: HubNetworkPeerRow): boolean {
  const s = String(p.status || "").toLowerCase();
  if (s === "connected") return true;
  const meta = p.metadata && typeof p.metadata === "object" ? p.metadata : {};
  const mesh = Number((meta as { meshSessionCount?: unknown }).meshSessionCount);
  if (Number.isFinite(mesh) && mesh > 0) return true;
  return false;
}
