import type { PersistedState } from "./storage";
import type { ShoppingItem, Task } from "./types";

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function createSeedState(now: Date = new Date()): PersistedState {
  const today = isoDate(now);
  const tasks: Task[] = [];

  const shopping: ShoppingItem[] = [
    
  ];

  return {
    tasks,
    shopping,
    petCompletions: {},
  };
}
