import { hubUrl } from "./hubHttp";

export type HubBitcoinStatus = {
  ok: true;
  httpStatus: number;
  json: Record<string, unknown>;
} | { ok: false; httpStatus: number; error: string };

/** Hub `GET /services/bitcoin/wallets` — single wallet summary (not a `wallets[]` list). */
export type HubBitcoinWalletSummary = {
  ok: true;
  httpStatus: number;
  json: Record<string, unknown>;
} | { ok: false; httpStatus: number; error: string };

/** Hub `GET /services/bitcoin/addresses` — unused receive address + wallet id. */
export type HubBitcoinAddressInfo = {
  ok: true;
  httpStatus: number;
  json: Record<string, unknown>;
} | { ok: false; httpStatus: number; error: string };

export type HubBitcoinSnapshot = {
  status: HubBitcoinStatus;
  /** Summaries from {@code GET /services/bitcoin/wallets} */
  wallets: HubBitcoinWalletSummary;
  /** Receive address from {@code GET /services/bitcoin/addresses} */
  address: HubBitcoinAddressInfo;
};

/** @deprecated Use HubBitcoinWalletSummary */
export type HubBitcoinWallets = HubBitcoinWalletSummary;

let cache: { at: number; data: HubBitcoinSnapshot } | null = null;

const CACHE_MS = 7000;

async function loadStatus(): Promise<HubBitcoinStatus> {
  let res: Response;
  try {
    res = await fetch(hubUrl("/services/bitcoin"), {
      headers: { Accept: "application/json" },
    });
  } catch {
    return { ok: false, httpStatus: 0, error: "network" };
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && json && typeof json === "object") {
    return { ok: true, httpStatus: res.status, json };
  }
  return { ok: false, httpStatus: res.status, error: String(json.message || res.statusText || "error") };
}

async function loadWalletSummary(): Promise<HubBitcoinWalletSummary> {
  let res: Response;
  try {
    res = await fetch(hubUrl("/services/bitcoin/wallets"), {
      headers: { Accept: "application/json" },
    });
  } catch {
    return { ok: false, httpStatus: 0, error: "network" };
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && json && typeof json === "object") {
    return { ok: true, httpStatus: res.status, json };
  }
  return { ok: false, httpStatus: res.status, error: String(json.message || res.statusText || "error") };
}

async function loadReceiveAddress(): Promise<HubBitcoinAddressInfo> {
  let res: Response;
  try {
    res = await fetch(hubUrl("/services/bitcoin/addresses"), {
      headers: { Accept: "application/json" },
    });
  } catch {
    return { ok: false, httpStatus: 0, error: "network" };
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && json && typeof json === "object") {
    return { ok: true, httpStatus: res.status, json };
  }
  return { ok: false, httpStatus: res.status, error: String(json.message || res.statusText || "error") };
}

export async function fetchHubBitcoinSnapshot(force = false): Promise<HubBitcoinSnapshot> {
  const now = Date.now();
  if (!force && cache && now - cache.at < CACHE_MS) {
    return cache.data;
  }
  const [status, wallets, address] = await Promise.all([loadStatus(), loadWalletSummary(), loadReceiveAddress()]);
  const data: HubBitcoinSnapshot = { status, wallets, address };
  cache = { at: Date.now(), data };
  return data;
}

function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Parse balance fields from Hub wallet summary JSON. */
export function parseWalletBalances(summary: Record<string, unknown>): {
  balanceSats: number | null;
  confirmedSats: number | null;
  unconfirmedSats: number | null;
  network: string | null;
  walletId: string | null;
} {
  return {
    balanceSats: numOrNull(summary.balanceSats),
    confirmedSats: numOrNull(summary.confirmedSats),
    unconfirmedSats: numOrNull(summary.unconfirmedSats),
    network: typeof summary.network === "string" ? summary.network : null,
    walletId: typeof summary.walletId === "string" ? summary.walletId : typeof summary.id === "string" ? summary.id : null,
  };
}

/**
 * Receive address: prefer {@code GET /services/bitcoin/addresses}, then legacy {@code wallets[]} shape.
 */
export function pickReceiveAddress(s: Pick<HubBitcoinSnapshot, "wallets" | "address">): string | null {
  if (s.address?.ok) {
    const addr = s.address.json.address;
    if (typeof addr === "string" && addr.trim()) return addr.trim();
  }
  if (!s.wallets?.ok) return null;
  const wj = s.wallets.json;
  const list = wj.wallets;
  if (!Array.isArray(list) || list.length === 0) return null;
  const w0 = list[0];
  if (!w0 || typeof w0 !== "object") return null;
  const o = w0 as Record<string, unknown>;
  const a = o.address ?? o.receiveAddress ?? o.lastAddress;
  return typeof a === "string" && a.trim().length > 0 ? a.trim() : null;
}

/** Wallet id from address response or hub wallet summary object. */
export function pickWalletId(s: Pick<HubBitcoinSnapshot, "wallets" | "address">): string | null {
  if (s.address?.ok) {
    const j = s.address.json;
    const id = j.walletId ?? j.id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  if (!s.wallets?.ok) return null;
  const wj = s.wallets.json;
  const direct = wj.walletId ?? wj.id;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const list = wj.wallets;
  if (!Array.isArray(list) || list.length === 0) return null;
  const w0 = list[0];
  if (!w0 || typeof w0 !== "object") return null;
  const id = (w0 as Record<string, unknown>).walletId ?? (w0 as Record<string, unknown>).id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}
