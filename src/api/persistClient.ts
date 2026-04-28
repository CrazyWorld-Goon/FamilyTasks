import { parsePersistedState, type PersistedState } from "../storage";

const API = "/api";

export type LoadStateResult = { ok: true; state: PersistedState } | { ok: false; notFound: true } | { ok: false; error: string };

export async function fetchPersistedState(): Promise<LoadStateResult> {
  try {
    const res = await fetch(`${API}/state`, { cache: "no-store" });
    if (res.status === 404) return { ok: false, notFound: true };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const json: unknown = await res.json();
    const state = parsePersistedState(json);
    if (!state) return { ok: false, error: "Неверный формат данных" };
    return { ok: true, state };
  } catch {
    return { ok: false, error: "Сеть или сервер недоступны" };
  }
}

export async function putPersistedState(state: PersistedState): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API}/state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch {
    return { ok: false, error: "Не удалось сохранить" };
  }
}
