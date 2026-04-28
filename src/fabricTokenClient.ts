import type { FabricActorId } from "./fabricIds";

const API = "/api";

/** Session flag: wizard finished; show signed-owner backup step until acknowledged. */
const PENDING_SS_KEY = "familytasks:pendingFabricOwnerToken";

/** Local persistence for the hub-signed envelope (offline / recovery affordance). */
export const FABRIC_OWNER_TOKEN_LS_KEY = "familytasks:fabricOwnerTokenEnvelope";

export type FabricOwnerTokenEnvelope = {
  version: number;
  algorithm: string;
  issuer: string;
  payload: Record<string, unknown>;
  signerPublicHex: string;
  signatureHex: string;
  messageSha256Hex: string;
};

export interface StoredFabricOwnerToken {
  userId: FabricActorId;
  envelope: FabricOwnerTokenEnvelope;
  storedAt: string;
}

export function setPendingOwnerToken(userId: string): void {
  try {
    sessionStorage.setItem(PENDING_SS_KEY, userId);
  } catch {
    /* privacy mode */
  }
}

export function getPendingOwnerTokenUserId(): FabricActorId | null {
  try {
    const raw = sessionStorage.getItem(PENDING_SS_KEY);
    return raw && /^[a-f0-9]{64}$/.test(raw) ? (raw as FabricActorId) : null;
  } catch {
    return null;
  }
}

export function clearPendingOwnerToken(): void {
  try {
    sessionStorage.removeItem(PENDING_SS_KEY);
  } catch {
    /* noop */
  }
}

export function getStoredFabricOwnerToken(): StoredFabricOwnerToken | null {
  try {
    const raw = localStorage.getItem(FABRIC_OWNER_TOKEN_LS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    if (
      typeof o.userId !== "string" ||
      typeof o.storedAt !== "string" ||
      !o.envelope ||
      typeof o.envelope !== "object"
    ) {
      return null;
    }
    return {
      userId: o.userId as FabricActorId,
      storedAt: o.storedAt,
      envelope: o.envelope as FabricOwnerTokenEnvelope,
    };
  } catch {
    return null;
  }
}

export function storeFabricOwnerToken(userId: FabricActorId, envelope: FabricOwnerTokenEnvelope): void {
  const row: StoredFabricOwnerToken = {
    userId,
    envelope,
    storedAt: new Date().toISOString(),
  };
  localStorage.setItem(FABRIC_OWNER_TOKEN_LS_KEY, JSON.stringify(row));
}

export async function fetchIssueOwnerToken(
  userId: FabricActorId,
): Promise<
  { ok: true; envelope: FabricOwnerTokenEnvelope } | { ok: false; status?: number }
> {
  try {
    const res = await fetch(`${API}/fabric/issue-owner-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      const envelope = (await res.json()) as FabricOwnerTokenEnvelope;
      return { ok: true, envelope };
    }
    return { ok: false, status: res.status };
  } catch {
    return { ok: false };
  }
}

/** Retries while server responds 409 (`family_not_ready`) — state save may lag the debounced client PUT. */
export async function issueOwnerTokenWithRetry(
  userId: FabricActorId,
  opts?: { maxAttempts?: number; delayMs?: number },
): Promise<
  { ok: true; envelope: FabricOwnerTokenEnvelope } | { ok: false; status?: number }
> {
  const maxAttempts = opts?.maxAttempts ?? 40;
  const delayMs = opts?.delayMs ?? 400;
  for (let i = 0; i < maxAttempts; i++) {
    const r = await fetchIssueOwnerToken(userId);
    if (r.ok) return r;
    if (r.status === 409) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }
    return r;
  }
  return { ok: false, status: 409 };
}
