import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_MEMBERS } from "../constants";
import { fetchPersistedState, putPersistedState } from "../api/persistClient";
import type { AppI18nError } from "../i18n/appError";
import { mergeShoppingWithServer, shoppingDataEqual } from "../logic/mergeShopping";
import { normalizeShoppingTitle } from "../logic/shoppingList";
import { isTaskSlotMissedToday } from "../logic/slotMissed";
import { normalizeWeekdays } from "../logic/taskSchedule";
import { createSeedState } from "../seed";
import type { PersistedState } from "../storage";
import type { DayPhase, FamilyMember, MemberId, PaymentProposal, ShoppingItem, Task, TaskStatus } from "../types";
import { newFabricEntityIdHex, isFabricActorId } from "../fabricIds";
import { logFabricPaymentProposal } from "../fabricPaymentProposal";
import { persistableShoppingPhasesAllTab } from "../logic/shoppingAllTabPhases";

function todayKey(d = new Date()): string {
  const base = new Date(d);
  if (base.getHours() < SHOP_RESET_HOUR) {
    base.setDate(base.getDate() - 1);
  }
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
}

function shouldMoveTaskToNextDay(slot: Task["slot"], plannedTime: string | undefined, now: Date): boolean {
  const logicalToday = todayKey(now);
  if (plannedTime) {
    const probe: Task = {
      id: "__probe__",
      title: "__probe__",
      assignee: "__probe__" as MemberId,
      status: "planned",
      slot: "any",
      plannedTime,
      dueDate: logicalToday,
    };
    return isTaskSlotMissedToday(probe, now, logicalToday);
  }
  if (slot === "night" || slot === "sleep" || slot === "any") {
    return true;
  }
  const probe: Task = {
    id: "__probe__",
    title: "__probe__",
    assignee: "__probe__" as MemberId,
    status: "planned",
    slot,
    dueDate: logicalToday,
  };
  return isTaskSlotMissedToday(probe, now, logicalToday);
}

const SHOP_RESET_HOUR = 4;

function shoppingDayKey(d = new Date()): string {
  const base = new Date(d);
  if (base.getHours() < SHOP_RESET_HOUR) {
    base.setDate(base.getDate() - 1);
  }
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
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
          if (status === "done") {
            next.sharedAt = undefined;
          }
          if (status === "done" && t.recurrence === "daily") {
            next.lastCompletedOn = today;
          }
          return next;
        });
        let shopping = s.shopping;
        const task = s.tasks.find((t) => t.id === taskId);
        const sid = task?.shoppingItemId;
        if (status === "done" && sid) {
          const shoppingDay = shoppingDayKey();
          shopping = s.shopping.map((i) =>
            i.id === sid ? { ...i, status: "bought" as const, boughtAt: shoppingDay } : i,
          );
        }
        return { ...s, tasks, shopping };
      });
    },
    [update],
  );

  const markShoppingBought = useCallback((shoppingId: string) => {
    const t = shoppingDayKey();
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

  const setShoppingAssignee = useCallback((id: string, assignee: MemberId) => {
    update((s) => ({
      ...s,
      shopping: s.shopping.map((i) => (i.id === id ? { ...i, assignee } : i)),
    }));
  }, [update]);

  const addShopping = useCallback((title: string, assignee: MemberId, opts?: { budgetSats?: number }) => {
    const id = newFabricEntityIdHex();
    const bs = opts?.budgetSats;
    const budgetSats =
      bs !== undefined && Number.isFinite(bs) && Math.floor(bs) > 0 ? Math.floor(bs) : undefined;
    const item: ShoppingItem = {
      id,
      title: title.trim(),
      assignee,
      status: "open",
      createdAt: todayKey(),
      ...(budgetSats ? { budgetSats } : {}),
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

  const rejectShoppingItem = useCallback((id: string) => {
    update((s) => {
      const tasks = s.tasks.map((t) =>
        t.shoppingItemId === id ? { ...t, shoppingItemId: undefined } : t,
      );
      const shopping = s.shopping.map((i) =>
        i.id === id ? { ...i, status: "rejected" as const, boughtAt: undefined } : i,
      );
      return { ...s, tasks, shopping };
    });
  }, [update]);

  const removeBoughtHistoryByTitleKey = useCallback((key: string) => {
    update((s) => {
      const ids = s.shopping
        .filter((i) => i.status !== "open" && normalizeShoppingTitle(i.title) === key)
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
      opts?: {
        recurrence?: "daily";
        assignees?: MemberId[];
        active?: boolean;
        plannedTime?: string;
        weekdays?: number[];
        fabricPublished?: boolean;
        notes?: string;
      },
    ) => {
      const id = newFabricEntityIdHex();
      const normalizedAssignees = opts?.assignees?.length ? Array.from(new Set(opts.assignees)) : undefined;
      const effectiveAssignee = normalizedAssignees?.[0] ?? assignee;
      const notes = opts?.notes?.trim();
      const now = new Date();
      const shouldShiftDueDate = shouldMoveTaskToNextDay(slot, opts?.plannedTime, now);
      const dueDate = shouldShiftDueDate
        ? todayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000))
        : todayKey(now);
      const task: Task = {
        id,
        title: title.trim(),
        assignee: effectiveAssignee,
        assignees: normalizedAssignees,
        status: "planned",
        slot,
        active: opts?.active ?? true,
        plannedTime: opts?.plannedTime,
        dueDate,
        recurrence: opts?.recurrence,
        weekdays: opts?.recurrence === "daily" ? normalizeWeekdays(opts.weekdays) : undefined,
        ...(notes ? { notes } : {}),
        ...(opts?.fabricPublished ? { fabricPublished: true as const } : {}),
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
        weekdays?: number[];
        sharedAt?: string;
        fabricPublished?: boolean;
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
          const firstAssignee = unique[0];
          if (firstAssignee) next.assignee = firstAssignee;
        }
        if (patch.slot !== undefined) next.slot = patch.slot;
        if (patch.active !== undefined) next.active = patch.active;
        if (patch.plannedTime !== undefined) next.plannedTime = patch.plannedTime || undefined;
        if (patch.weekdays !== undefined) next.weekdays = normalizeWeekdays(patch.weekdays);
        if (patch.sharedAt !== undefined) next.sharedAt = patch.sharedAt || undefined;
        if (patch.fabricPublished !== undefined) {
          next.fabricPublished = patch.fabricPublished ? true : undefined;
        }
        if (patch.notes !== undefined) {
          const n = patch.notes.trim();
          next.notes = n || undefined;
        }
        if (patch.daily === true) {
          next.recurrence = "daily";
        } else if (patch.daily === false) {
          next.recurrence = undefined;
          next.weekdays = undefined;
          next.lastCompletedOn = undefined;
        }
        if (patch.status !== undefined) {
          next.status = patch.status;
          if (patch.status === "done") {
            next.sharedAt = undefined;
          }
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

  const setFabricTasksPublic = useCallback(
    (next: boolean) => {
      update((s) => ({
        ...s,
        family: { ...(s.family ?? { setupComplete: true }), fabricTasksPublic: next },
      }));
    },
    [update],
  );

  const setFamilyProfile = useCallback(
    (input: { displayName?: string; description?: string; bitcoinFeatures?: boolean }) => {
      update((s) => {
        const fam = s.family ?? { setupComplete: true };
        const next: typeof fam = { ...fam };
        if (input.displayName !== undefined) {
          const v = input.displayName.trim();
          next.displayName = v.length > 0 ? v : undefined;
        }
        if (input.description !== undefined) {
          const v = input.description.trim();
          next.description = v.length > 0 ? v : undefined;
        }
        if (input.bitcoinFeatures !== undefined) {
          next.bitcoinFeatures = input.bitcoinFeatures;
        }
        return { ...s, family: next };
      });
    },
    [update],
  );

  const setShoppingVisiblePhasesAllTab = useCallback(
    (phases: DayPhase[]) => {
      update((s) => {
        const fam = s.family ?? { setupComplete: true };
        return {
          ...s,
          family: { ...fam, shoppingVisiblePhasesAllTab: persistableShoppingPhasesAllTab(phases) },
        };
      });
    },
    [update],
  );

  const completeFamilySetup = useCallback(
    async (input: {
      displayName: string;
      shortName: string;
      fullName: string;
      role: string;
      color: string;
      fabricTasksPublic?: boolean;
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
          ...(input.fabricTasksPublic === true ? { fabricTasksPublic: true } : {}),
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

  const patchShoppingItem = useCallback((shoppingId: string, patch: { budgetSats?: number }) => {
    update((s) => ({
      ...s,
      shopping: s.shopping.map((i) => {
        if (i.id !== shoppingId) return i;
        if (patch.budgetSats === undefined) return i;
        const v = Math.floor(patch.budgetSats);
        if (!Number.isFinite(v) || v <= 0) {
          const { budgetSats: _b, ...rest } = i;
          return rest as ShoppingItem;
        }
        return { ...i, budgetSats: v };
      }),
    }));
  }, [update]);

  const addPaymentProposal = useCallback(
    (input: {
      fromMemberId: MemberId;
      amountSats: number;
      memo: string;
      shoppingItemId?: MemberId;
    }) => {
      const amount = Math.floor(input.amountSats);
      if (!Number.isFinite(amount) || amount <= 0) return;
      const id = newFabricEntityIdHex();
      const proposal: PaymentProposal = {
        id,
        type: "PaymentProposal",
        fromMemberId: input.fromMemberId,
        amountSats: amount,
        memo: input.memo.trim(),
        ...(input.shoppingItemId ? { shoppingItemId: input.shoppingItemId } : {}),
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      logFabricPaymentProposal(proposal);
      update((s) => ({
        ...s,
        paymentProposals: [...(s.paymentProposals ?? []), proposal],
      }));
    },
    [update],
  );

  const setPaymentProposalStatus = useCallback(
    (proposalId: string, status: "approved" | "rejected") => {
      update((s) => ({
        ...s,
        paymentProposals: (s.paymentProposals ?? []).map((p) =>
          p.id === proposalId && p.status === "pending"
            ? { ...p, status, decidedAt: new Date().toISOString() }
            : p,
        ),
      }));
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

  const updateMember = useCallback(
    (id: MemberId, patch: { shortName: string; fullName: string; role: string; color: string }) => {
      update((s) => {
        const users = s.users ?? DEFAULT_MEMBERS.map((m) => ({ ...m }));
        const colorRaw = patch.color.trim();
        const color = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(colorRaw) ? colorRaw : "#7b9eb8";
        const shortName = patch.shortName.trim();
        const fullName = patch.fullName.trim();
        const role = patch.role.trim();
        if (!shortName || !fullName || !role) return s;
        return {
          ...s,
          users: users.map((u) =>
            u.id === id
              ? {
                  ...u,
                  shortName,
                  fullName,
                  role,
                  color,
                }
              : u,
          ),
        };
      });
    },
    [update],
  );

  const reorderMembers = useCallback(
    (fromIndex: number, toIndex: number) => {
      update((s) => {
        const users = s.users ?? DEFAULT_MEMBERS.map((m) => ({ ...m }));
        if (users.length <= 1) return s;
        if (
          fromIndex === toIndex ||
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= users.length ||
          toIndex >= users.length
        ) {
          return s;
        }
        const next = [...users];
        const [removed] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, removed);
        return { ...s, users: next };
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
    setShoppingAssignee,
    addShopping,
    patchShoppingItem,
    reopenShoppingItem,
    rejectShoppingItem,
    removeShoppingItem,
    removeBoughtHistoryByTitleKey,
    addTask,
    setTaskNotes,
    updateTask,
    deleteTask,
    setPetCompletion,
    addMember,
    updateMember,
    reorderMembers,
    removeMember,
    completeFamilySetup,
    setFabricTasksPublic,
    setFamilyProfile,
    setShoppingVisiblePhasesAllTab,
    addPaymentProposal,
    setPaymentProposalStatus,
    resetDemo,
  };
}
