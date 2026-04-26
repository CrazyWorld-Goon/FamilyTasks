import { useCallback, useEffect, useState } from "react";
import { createSeedState } from "../seed";
import { loadState, saveState, type PersistedState } from "../storage";
import type { MemberId, ShoppingItem, Task, TaskStatus } from "../types";

function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function usePersistedApp() {
  const [state, setState] = useState<PersistedState | null>(null);

  useEffect(() => {
    const loaded = loadState();
    setState(loaded ?? createSeedState());
  }, []);

  useEffect(() => {
    if (state) saveState(state);
  }, [state]);

  const update = useCallback((fn: (s: PersistedState) => PersistedState) => {
    setState((s) => (s ? fn(s) : s));
  }, []);

  const setTaskStatus = useCallback((taskId: string, status: TaskStatus) => {
    update((s) => {
      const tasks = s.tasks.map((t) => (t.id === taskId ? { ...t, status } : t));
      let shopping = s.shopping;
      const task = s.tasks.find((t) => t.id === taskId);
      const sid = task?.shoppingItemId;
      if (status === "done" && sid) {
        shopping = s.shopping.map((i) => (i.id === sid ? { ...i, status: "bought" as const } : i));
      }
      return { ...s, tasks, shopping };
    });
  }, [update]);

  const markShoppingBought = useCallback((shoppingId: string) => {
    update((s) => ({
      ...s,
      shopping: s.shopping.map((i) => (i.id === shoppingId ? { ...i, status: "bought" as const } : i)),
    }));
  }, [update]);

  const setShoppingStatus = useCallback((id: string, status: ShoppingItem["status"]) => {
    update((s) => ({
      ...s,
      shopping: s.shopping.map((i) => (i.id === id ? { ...i, status } : i)),
    }));
  }, [update]);

  const addShopping = useCallback((title: string, assignee: MemberId) => {
    const id = `s${Date.now()}`;
    const item: ShoppingItem = {
      id,
      title: title.trim(),
      assignee,
      status: "open",
      createdAt: todayKey(),
    };
    update((s) => ({ ...s, shopping: [item, ...s.shopping] }));
  }, [update]);

  const addTask = useCallback((title: string, assignee: MemberId, slot: Task["slot"]) => {
    const id = `t${Date.now()}`;
    const task: Task = {
      id,
      title: title.trim(),
      assignee,
      status: "planned",
      slot,
      dueDate: todayKey(),
    };
    update((s) => ({ ...s, tasks: [task, ...s.tasks] }));
  }, [update]);

  const setPetCompletion = useCallback((key: string, status: TaskStatus) => {
    update((s) => ({
      ...s,
      petCompletions: { ...s.petCompletions, [key]: status },
    }));
  }, [update]);

  const resetDemo = useCallback(() => {
    setState(createSeedState());
  }, []);

  const ready = state !== null;

  return {
    ready,
    state,
    setTaskStatus,
    markShoppingBought,
    setShoppingStatus,
    addShopping,
    addTask,
    setPetCompletion,
    resetDemo,
  };
}
