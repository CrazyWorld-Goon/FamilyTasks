import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPersistedState, putPersistedState } from "../api/persistClient";
import type { AppI18nError } from "../i18n/appError";
import { mergeShoppingWithServer, shoppingDataEqual } from "../logic/mergeShopping";
import { normalizeShoppingTitle } from "../logic/shoppingList";
import { createSeedState } from "../seed";
import type { PersistedState } from "../storage";
import type { MemberId, ShoppingItem, Task, TaskStatus } from "../types";

function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

const SAVE_DEBOUNCE_MS = 400;
const SHOP_POLL_MS = 120_000;
const SAVE_RETRY_MS = 15_000;

export function usePersistedApp() {
  const [state, setState] = useState<PersistedState | null>(null);
  const [initialError, setInitialError] = useState<AppI18nError | null>(null);
  const [saveError, setSaveError] = useState<AppI18nError | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<PersistedState | null>(null);
  const skipNextSave = useRef(false);
  const stateRef = useRef<PersistedState | null>(null);
  const saveRetryInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const clearSaveRetry = useCallback(() => {
    if (saveRetryInterval.current) {
      clearInterval(saveRetryInterval.current);
      saveRetryInterval.current = null;
    }
  }, []);

  const flushSave = useCallback(
    (data: PersistedState) => {
      void putPersistedState(data).then((r) => {
        if (r.ok) {
          setSaveError(null);
          clearSaveRetry();
        } else {
          setSaveError(r.err);
          if (!saveRetryInterval.current) {
            saveRetryInterval.current = setInterval(() => {
              const s = stateRef.current;
              if (s) {
                void putPersistedState(s).then((r2) => {
                  if (r2.ok) {
                    setSaveError(null);
                    clearSaveRetry();
                  }
                });
              }
            }, SAVE_RETRY_MS);
          }
        }
      });
    },
    [clearSaveRetry],
  );

  const scheduleSave = useCallback(
    (data: PersistedState) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      pendingSave.current = data;
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        const s = pendingSave.current;
        if (s) flushSave(s);
      }, SAVE_DEBOUNCE_MS);
    },
    [flushSave],
  );

  const load = useCallback(async () => {
    setInitialError(null);
    setHydrated(false);
    const result = await fetchPersistedState();
    if (result.ok) {
      skipNextSave.current = true;
      setState(result.state);
    } else if (!result.ok && "notFound" in result && result.notFound) {
      const seed = createSeedState();
      skipNextSave.current = true;
      setState(seed);
      const put = await putPersistedState(seed);
      if (!put.ok) setSaveError(put.err);
    } else if (!result.ok && "err" in result) {
      setState(null);
      setInitialError(result.err);
    } else if (!result.ok) {
      setState(null);
      setInitialError({ key: "errors.unknown" });
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!state) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    scheduleSave(state);
  }, [state, scheduleSave]);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (pendingSave.current) {
        void putPersistedState(pendingSave.current);
      }
      clearSaveRetry();
    },
    [clearSaveRetry],
  );

  useEffect(() => {
    const onOnline = () => {
      const s = stateRef.current;
      if (s) {
        void putPersistedState(s).then((r) => {
          if (r.ok) {
            setSaveError(null);
            clearSaveRetry();
          }
        });
      }
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [clearSaveRetry]);

  useEffect(() => {
    if (!hydrated) return;
    const poll = () => {
      void (async () => {
        const r = await fetchPersistedState();
        if (!r.ok) return;
        setState((prev) => {
          if (!prev) return prev;
          const merged = mergeShoppingWithServer(prev.shopping, r.state.shopping);
          if (shoppingDataEqual(merged, prev.shopping)) return prev;
          return { ...prev, shopping: merged };
        });
      })();
    };
    const id = setInterval(poll, SHOP_POLL_MS);
    return () => clearInterval(id);
  }, [hydrated]);

  const update = useCallback((fn: (s: PersistedState) => PersistedState) => {
    setState((s) => (s ? fn(s) : s));
  }, []);

  const setTaskStatus = useCallback(
    (taskId: string, status: TaskStatus) => {
      update((s) => {
        const today = todayKey();
        const tasks = s.tasks.map((t) => {
          if (t.id !== taskId) return t;
          const next: Task = { ...t, status };
          if (status === "done" && t.recurrence === "daily") {
            next.lastCompletedOn = today;
          }
          return next;
        });
        let shopping = s.shopping;
        const task = s.tasks.find((t) => t.id === taskId);
        const sid = task?.shoppingItemId;
        if (status === "done" && sid) {
          shopping = s.shopping.map((i) =>
            i.id === sid ? { ...i, status: "bought" as const, boughtAt: today } : i,
          );
        }
        return { ...s, tasks, shopping };
      });
    },
    [update],
  );

  const markShoppingBought = useCallback((shoppingId: string) => {
    const t = todayKey();
    update((s) => ({
      ...s,
      shopping: s.shopping.map((i) => (i.id === shoppingId ? { ...i, status: "bought" as const, boughtAt: t } : i)),
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

  const reopenShoppingItem = useCallback((shoppingId: string) => {
    update((s) => ({
      ...s,
      shopping: s.shopping.map((i) =>
        i.id === shoppingId ? { ...i, status: "open" as const, boughtAt: undefined } : i,
      ),
    }));
  }, [update]);

  const removeShoppingItem = useCallback((id: string) => {
    update((s) => {
      const tasks = s.tasks.map((t) =>
        t.shoppingItemId === id ? { ...t, shoppingItemId: undefined } : t,
      );
      return { ...s, tasks, shopping: s.shopping.filter((i) => i.id !== id) };
    });
  }, [update]);

  const removeBoughtHistoryByTitleKey = useCallback((key: string) => {
    update((s) => {
      const ids = s.shopping
        .filter((i) => i.status === "bought" && normalizeShoppingTitle(i.title) === key)
        .map((i) => i.id);
      if (ids.length === 0) return s;
      const remove = new Set(ids);
      const tasks = s.tasks.map((t) =>
        t.shoppingItemId && remove.has(t.shoppingItemId) ? { ...t, shoppingItemId: undefined } : t,
      );
      return { ...s, tasks, shopping: s.shopping.filter((i) => !remove.has(i.id)) };
    });
  }, [update]);

  const addTask = useCallback(
    (
      title: string,
      assignee: MemberId,
      slot: Task["slot"],
      opts?: { recurrence?: "daily"; assignees?: MemberId[]; active?: boolean; plannedTime?: string },
    ) => {
      const id = `t${Date.now()}`;
      const normalizedAssignees = opts?.assignees?.length ? Array.from(new Set(opts.assignees)) : undefined;
      const effectiveAssignee = normalizedAssignees?.[0] ?? assignee;
      const task: Task = {
        id,
        title: title.trim(),
        assignee: effectiveAssignee,
        assignees: normalizedAssignees,
        status: "planned",
        slot,
        active: opts?.active ?? true,
        plannedTime: opts?.plannedTime,
        dueDate: todayKey(),
        recurrence: opts?.recurrence,
      };
      update((s) => ({ ...s, tasks: [task, ...s.tasks] }));
    },
    [update],
  );

  const setTaskNotes = useCallback((taskId: string, notes: string) => {
    const trimmed = notes.trim();
    update((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, notes: trimmed || undefined } : t)),
    }));
  }, [update]);

  const updateTask = useCallback(
    (
      taskId: string,
      patch: {
        title?: string;
        assignee?: MemberId;
        slot?: Task["slot"];
        notes?: string;
        status?: TaskStatus;
        daily?: boolean;
        assignees?: MemberId[];
        active?: boolean;
        plannedTime?: string;
      },
    ) => {
      const today = todayKey();
      update((s) => {
        const existing = s.tasks.find((t) => t.id === taskId);
        if (!existing) return s;
        const next: Task = { ...existing };
        if (patch.title !== undefined) next.title = patch.title.trim() || existing.title;
        if (patch.assignee !== undefined) next.assignee = patch.assignee;
        if (patch.assignees !== undefined) {
          const unique = Array.from(new Set(patch.assignees));
          next.assignees = unique.length > 0 ? unique : undefined;
          if (unique.length > 0) next.assignee = unique[0];
        }
        if (patch.slot !== undefined) next.slot = patch.slot;
        if (patch.active !== undefined) next.active = patch.active;
        if (patch.plannedTime !== undefined) next.plannedTime = patch.plannedTime || undefined;
        if (patch.notes !== undefined) {
          const n = patch.notes.trim();
          next.notes = n || undefined;
        }
        if (patch.daily === true) {
          next.recurrence = "daily";
        } else if (patch.daily === false) {
          next.recurrence = undefined;
          next.lastCompletedOn = undefined;
        }
        if (patch.status !== undefined) {
          next.status = patch.status;
        }
        if (next.recurrence === "daily" && next.status === "done") {
          next.lastCompletedOn = today;
        } else if (next.recurrence === "daily" && next.status !== "done") {
          next.lastCompletedOn = undefined;
        }

        const tasks = s.tasks.map((t) => (t.id === taskId ? next : t));
        let shopping = s.shopping;
        const sid = existing.shoppingItemId;
        if (sid) {
          if (next.status === "done") {
            shopping = s.shopping.map((i) =>
              i.id === sid ? { ...i, status: "bought" as const, boughtAt: today } : i,
            );
          } else if (existing.status === "done") {
            shopping = s.shopping.map((i) =>
              i.id === sid ? { ...i, status: "open" as const, boughtAt: undefined } : i,
            );
          }
        }
        return { ...s, tasks, shopping };
      });
    },
    [update],
  );

  const deleteTask = useCallback((taskId: string) => {
    update((s) => ({
      ...s,
      tasks: s.tasks.filter((t) => t.id !== taskId),
    }));
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

  const ready = hydrated && state !== null;
  const dismissSaveError = useCallback(() => setSaveError(null), []);

  return {
    ready,
    state,
    initialError,
    saveError,
    retryLoad: load,
    dismissSaveError,
    setTaskStatus,
    markShoppingBought,
    setShoppingStatus,
    addShopping,
    reopenShoppingItem,
    removeShoppingItem,
    removeBoughtHistoryByTitleKey,
    addTask,
    setTaskNotes,
    updateTask,
    deleteTask,
    setPetCompletion,
    resetDemo,
  };
}
