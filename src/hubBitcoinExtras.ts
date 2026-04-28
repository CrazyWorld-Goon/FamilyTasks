"use strict";

import { getPublicFabricHubOrigin, hubUrl } from "./hubHttp";

/** Hub `GET /services/bitcoin` — best-effort network id (e.g. regtest, mainnet). */
export function parseBitcoinServiceNetwork(json: Record<string, unknown>): string | null {
  const n = json.network ?? json.chain;
  if (typeof n === "string" && n.trim()) return n.trim().toLowerCase();
  return null;
}

export function normalizeTxid(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (/^[0-9a-f]{64}$/.test(s)) return s;
  return "";
}

const FAUCET_MAX_SATS = 1_000_000;

export type BitcoinFaucetResult =
  | {
      ok: true;
      httpStatus: number;
      network: string | null;
      txid: string;
      destination: string;
      amountSats: number;
    }
  | { ok: false; httpStatus: number; error: string; detail?: string };

function clampAmountSats(n: number | undefined): number {
  let amountSats =
    n != null && Number.isFinite(n) ? Math.round(n) : 10_000;
  if (amountSats <= 0) amountSats = 10_000;
  return Math.min(amountSats, FAUCET_MAX_SATS);
}

async function parseBitcoinFaucetResponse(res: Response): Promise<BitcoinFaucetResult> {
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      typeof json.message === "string"
        ? json.message
        : typeof json.error === "string"
          ? json.error
          : `http_${res.status}`;
    return { ok: false, httpStatus: res.status, error: msg, detail: typeof json.details === "string" ? json.details : undefined };
  }

  const status = json.status;
  const faucet = json.faucet;
  if (status !== "success" || !faucet || typeof faucet !== "object") {
    return { ok: false, httpStatus: res.status, error: "unexpected_response" };
  }
  const f = faucet as Record<string, unknown>;
  const txid = typeof f.txid === "string" ? f.txid : "";
  if (!txid) return { ok: false, httpStatus: res.status, error: "missing_txid" };

  const address = typeof f.destination === "string" ? f.destination : "";
  const amountSats =
    typeof f.amountSats === "number" && Number.isFinite(f.amountSats) ? Math.round(f.amountSats) : 10_000;

  return {
    ok: true,
    httpStatus: res.status,
    network: typeof json.network === "string" ? json.network : null,
    txid,
    destination: address,
    amountSats,
  };
}

async function postBitcoinFaucetToUrl(url: string, address: string, amountSats: number): Promise<BitcoinFaucetResult | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ address, amountSats }),
    });
    return await parseBitcoinFaucetResponse(res);
  } catch {
    return null;
  }
}

export async function postBitcoinFaucet(input: {
  address: string;
  amountSats?: number;
}): Promise<BitcoinFaucetResult> {
  const address = String(input.address || "").trim();
  if (!address) {
    return { ok: false, httpStatus: 400, error: "address_required" };
  }
  const amountSats = clampAmountSats(input.amountSats);
  const out = await postBitcoinFaucetToUrl(hubUrl("/services/bitcoin/faucet"), address, amountSats);
  return out ?? { ok: false, httpStatus: 0, error: "network" };
}

/** @see postPublicFabricFaucet */
export async function postPublicFabricFaucet(input: {
  address: string;
  amountSats?: number;
}): Promise<BitcoinFaucetResult> {
  const address = String(input.address || "").trim();
  if (!address) {
    return { ok: false, httpStatus: 400, error: "address_required" };
  }
  const amountSats = clampAmountSats(input.amountSats);
  const directUrl = `${getPublicFabricHubOrigin()}/services/bitcoin/faucet`;

  const proxied = await postBitcoinFaucetToUrl(hubUrl("/api/public-faucet"), address, amountSats);
  if (proxied?.ok) return proxied;

  const direct = await postBitcoinFaucetToUrl(directUrl, address, amountSats);
  if (direct) return direct;

  return proxied ?? { ok: false, httpStatus: 0, error: "network" };
}

export type BitcoinTransactionLookup =
  | {
      ok: true;
      httpStatus: number;
      json: Record<string, unknown>;
    }
  | { ok: false; httpStatus: number; error: string };

export async function fetchBitcoinTransaction(txid: string): Promise<BitcoinTransactionLookup> {
  const id = normalizeTxid(txid);
  if (!id) {
    return { ok: false, httpStatus: 400, error: "invalid_txid" };
  }

  let res: Response;
  try {
    res = await fetch(hubUrl(`/services/bitcoin/transactions/${encodeURIComponent(id)}`), {
      headers: { Accept: "application/json" },
    });
  } catch {
    return { ok: false, httpStatus: 0, error: "network" };
  }

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      typeof json.message === "string"
        ? json.message
        : typeof json.error === "string"
          ? json.error
          : `http_${res.status}`;
    return { ok: false, httpStatus: res.status, error: msg };
  }
  return { ok: true, httpStatus: res.status, json };
}
