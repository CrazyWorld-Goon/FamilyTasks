import type { AppI18nError } from "../i18n/appError";
import { parsePersistedState, type PersistedState } from "../storage";

const API = "/api";

export type LoadStateResult =
  | { ok: true; state: PersistedState }
  | { ok: false; notFound: true }
  | { ok: false; err: AppI18nError };

export async function fetchPersistedState(): Promise<LoadStateResult> {
  try {
    const res = await fetch(`${API}/state`, { cache: "no-store" });
    if (res.status === 404) return { ok: false, notFound: true };
    if (!res.ok) return { ok: false, err: { key: "errors.persist.http", values: { status: res.status } } };
    const json: unknown = await res.json();
    const state = parsePersistedState(json);
    if (!state) return { ok: false, err: { key: "errors.persist.invalidData" } };
    return { ok: true, state };
  } catch {
    return { ok: false, err: { key: "errors.persist.network" } };
  }
}

export async function putPersistedState(
  state: PersistedState,
): Promise<{ ok: true } | { ok: false; err: AppI18nError }> {
  try {
    const res = await fetch(`${API}/state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    if (!res.ok) return { ok: false, err: { key: "errors.persist.http", values: { status: res.status } } };
    return { ok: true };
  } catch {
    return { ok: false, err: { key: "errors.persist.saveFailed" } };
  }
}
