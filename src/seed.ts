import type { PersistedState } from "./storage";
import type { ShoppingItem, Task } from "./types";

export function createSeedState(_now: Date = new Date()): PersistedState {
  const tasks: Task[] = [];
  const shopping: ShoppingItem[] = [];

  return {
    tasks,
    shopping,
    petCompletions: {},
    users: [],
    family: {
      setupComplete: false,
    },
  };
}
