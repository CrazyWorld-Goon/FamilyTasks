import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_MEMBERS } from "../constants";
import { fetchPersistedState, putPersistedState } from "../api/persistClient";
import type { AppI18nError } from "../i18n/appError";
import { mergeShoppingWithServer, shoppingDataEqual } from "../logic/mergeShopping";
import { normalizeShoppingTitle } from "../logic/shoppingList";
import { createSeedState } from "../seed";
import type { PersistedState } from "../storage";
import type { FamilyMember, MemberId, ShoppingItem, Task, TaskStatus } from "../types";
import { newFabricEntityIdHex, isFabricActorId } from "../fabricIds";

function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

const SAVE_DEBOUNCE_MS = 400;
const SHOP_POLL_MS = 120_000;
const SAVE_RETRY_MS = 15_000;

function withDefaultUsers(s: PersistedState): PersistedState {
  if (s.family?.setupComplete === false) return s;
  if (s.users && s.users.length > 0) return s;
  return { ...s, users: DEFAULT_MEMBERS.map((m) => ({ ...m })) };
}

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
      setState(withDefaultUsers(result.state));
    } else if (!result.ok && "notFound" in result && result.notFound) {
      const seed = createSeedState();
      skipNextSave.current = true;
      setState(withDefaultUsers(seed));
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
          const mergedShopping = mergeShoppingWithServer(prev.shopping, r.state.shopping);
          if (shoppingDataEqual(mergedShopping, prev.shopping)) return prev;
          return withDefaultUsers({ ...prev, shopping: mergedShopping });
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
    const id = newFabricEntityIdHex();
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
    (title: string, assignee: MemberId, slot: Task["slot"], opts?: { recurrence?: "daily" }) => {
      const id = newFabricEntityIdHex();
      const task: Task = {
        id,
        title: title.trim(),
        assignee,
        status: "planned",
        slot,
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
      },
    ) => {
      const today = todayKey();
      update((s) => {
        const existing = s.tasks.find((t) => t.id === taskId);
        if (!existing) return s;
        const next: Task = { ...existing };
        if (patch.title !== undefined) next.title = patch.title.trim() || existing.title;
        if (patch.assignee !== undefined) next.assignee = patch.assignee;
        if (patch.slot !== undefined) next.slot = patch.slot;
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

  const completeFamilySetup = useCallback(
    async (input: {
      displayName: string;
      shortName: string;
      fullName: string;
      role: string;
      color: string;
    }): Promise<string> => {
      const s = stateRef.current;
      if (!s) return "";

      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      pendingSave.current = null;

      const id = newFabricEntityIdHex();
      const owner: FamilyMember = {
        id,
        shortName: input.shortName.trim() || "—",
        fullName: input.fullName.trim() || input.shortName.trim() || "—",
        role: input.role.trim() || "Owner",
        color: /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(String(input.color || "").trim())
          ? String(input.color).trim()
          : "#7b9eb8",
      };
      const setupCompletedAt = new Date().toISOString();
      const next: PersistedState = {
        ...s,
        users: [owner],
        family: {
          setupComplete: true,
          ownerUserId: id,
          displayName: input.displayName.trim(),
          setupCompletedAt,
        },
      };

      const putResult = await putPersistedState(next);
      if (!putResult.ok) {
        setSaveError(putResult.err);
        return "";
      }
      setSaveError(null);
      clearSaveRetry();
      skipNextSave.current = true;
      setState(next);
      return id;
    },
    [clearSaveRetry],
  );

  const members =
    state?.family?.setupComplete === false ? [] : state?.users?.length ? state.users : DEFAULT_MEMBERS;

  const addMember = useCallback(
    (input: Omit<FamilyMember, "id"> & { id?: string }) => {
      update((s) => {
        const users = s.users ?? DEFAULT_MEMBERS.map((m) => ({ ...m }));
        const existing = new Set(users.map((u) => u.id));
        let id = input.id?.trim() ?? "";
        if (!id) {
          id = newFabricEntityIdHex();
          if (existing.has(id)) return s;
        } else if (!isFabricActorId(id) || existing.has(id)) {
          return s;
        }
        const c = input.color.trim();
        const color = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(c) ? c : "#7b9eb8";
        const nu: FamilyMember = {
          id,
          shortName: input.shortName.trim(),
          fullName: input.fullName.trim(),
          role: input.role.trim(),
          color,
        };
        return { ...s, users: [...users, nu] };
      });
    },
    [update],
  );

  const removeMember = useCallback(
    (id: MemberId) => {
      update((s) => {
        const users = s.users ?? DEFAULT_MEMBERS.map((m) => ({ ...m }));
        if (users.length <= 1) return s;
        const nextUsers = users.filter((u) => u.id !== id);
        const fallback = nextUsers[0]!.id;
        const tasks = s.tasks.map((t) => (t.assignee === id ? { ...t, assignee: fallback } : t));
        const shopping = s.shopping.map((i) => (i.assignee === id ? { ...i, assignee: fallback } : i));
        return { ...s, users: nextUsers, tasks, shopping };
      });
    },
    [update],
  );

  const resetDemo = useCallback(() => {
    setState(createSeedState());
  }, []);

  const dismissSaveError = useCallback(() => setSaveError(null), []);

  const ready = hydrated && state !== null;

  return {
    ready,
    state,
    members,
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
    addMember,
    removeMember,
    completeFamilySetup,
    resetDemo,
  };
}
