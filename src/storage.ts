import { STORAGE_KEY } from "./constants";
import type { AppState, TaskStatus } from "./types";

export interface PersistedState extends AppState {
  petCompletions: Record<string, TaskStatus>;
}

export function loadState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<PersistedState>;
    if (!Array.isArray(p.tasks) || !Array.isArray(p.shopping)) return null;
    return {
      tasks: p.tasks,
      shopping: p.shopping,
      petCompletions: p.petCompletions ?? {},
    };
  } catch {
    return null;
  }
}

export function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}
