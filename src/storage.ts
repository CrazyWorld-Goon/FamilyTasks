import type { AppState, TaskStatus } from "./types";

export interface PersistedState extends AppState {
  petCompletions: Record<string, TaskStatus>;
}

/** Проверка тела ответа API / восстановленного JSON. */
export function parsePersistedState(raw: unknown): PersistedState | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<PersistedState>;
  if (!Array.isArray(p.tasks) || !Array.isArray(p.shopping)) return null;
  return {
    tasks: p.tasks,
    shopping: p.shopping,
    petCompletions: p.petCompletions && typeof p.petCompletions === "object" ? p.petCompletions : {},
  };
}
