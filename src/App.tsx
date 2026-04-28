import { useCallback, useEffect, useRef, useState } from "react";
import { MEMBERS } from "./constants";
import { IconCart, IconCheck, IconClock, IconCat, IconDog, IconListChecks, IconPlus, IconSkip, IconTrash, IconUsers } from "./components/Icons";
import { TasksManageDialog } from "./components/TasksManageDialog";
import { useI18n } from "./i18n/I18nProvider";
import type { Locale } from "./i18n/dicts";
import { usePersistedApp } from "./hooks/usePersistedApp";
import { publicAsset } from "./paths";
import { petRelevantWindow, petTaskRelevantNow, taskRelevantNow, taskRelevantWindow } from "./logic/relevance";
import { isTaskSlotMissedToday } from "./logic/slotMissed";
import { getRepurchaseCandidates, sortShoppingForDisplay } from "./logic/shoppingList";
import { getEffectiveTaskStatus } from "./logic/taskDay";
import { buildVirtualPetTasks, formatPlanTime } from "./logic/pets";
import { getDayPhase, phaseTimeRange } from "./logic/time";
import type { MemberId, ShoppingItem, TabId, Task, TaskStatus, TimeSlot, VirtualPetTask } from "./types";

const ACTIVE_TAB_STORAGE_KEY = "familyTasks.activeTab";
const NEW_TASK_FLASH_MS = 1800;

function isMemberId(value: string): value is MemberId {
  return MEMBERS.some((m) => m.id === value);
}

function dateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

type Row =
  | { kind: "task"; task: Task }
  | { kind: "pet"; pet: VirtualPetTask }
  | { kind: "shop"; item: ShoppingItem };

type DoneConfirmState =
  | { kind: "task"; id: string; title: string }
  | { kind: "shop"; id: string; title: string }
  | { kind: "pet"; id: string; title: string };

type RemoveConfirmState =
  | { kind: "shop"; id: string; title: string }
  | { kind: "repurchase"; key: string; title: string };

const LATER_PHASE_ORDER: Record<Exclude<TimeSlot, "any"> | "sleep" | "any", number> = {
  morning: 0,
  day: 1,
  evening: 2,
  night: 3,
  sleep: 4,
  any: 5,
};

function phaseForMinutes(totalMinutes: number): Exclude<TimeSlot, "any"> | "sleep" {
  const h = Math.floor(totalMinutes / 60);
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "day";
  if (h >= 17 && h < 22) return "evening";
  if (h >= 22 || h < 1) return "night";
  return "sleep";
}

function laterRowSortKey(row: Row): { phase: number; minute: number; title: string } {
  if (row.kind === "pet") {
    const minute = row.pet.plannedMinutes;
    return {
      phase: LATER_PHASE_ORDER[phaseForMinutes(minute)],
      minute,
      title: row.pet.title,
    };
  }
  if (row.kind === "task") {
    const slot = row.task.slot;
    const minuteBySlot: Record<TimeSlot, number> = {
      morning: 5 * 60,
      day: 12 * 60,
      evening: 17 * 60,
      night: 22 * 60,
      any: 24 * 60 + 1,
    };
    return {
      phase: LATER_PHASE_ORDER[slot === "any" ? "any" : slot],
      minute: minuteBySlot[slot],
      title: row.task.title,
    };
  }
  return { phase: LATER_PHASE_ORDER.any, minute: 24 * 60 + 2, title: row.item.title };
}

function sortLaterRows(rows: Row[], locale: Locale): Row[] {
  const collator = locale === "ru" ? "ru" : "en";
  return [...rows].sort((a, b) => {
    const ka = laterRowSortKey(a);
    const kb = laterRowSortKey(b);
    if (ka.phase !== kb.phase) return ka.phase - kb.phase;
    if (ka.minute !== kb.minute) return ka.minute - kb.minute;
    return ka.title.localeCompare(kb.title, collator);
  });
}

function useNowTicker(intervalMs: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export default function App() {
  const {
    ready,
    state,
    initialError,
    saveError,
    retryLoad,
    dismissSaveError,
    setTaskStatus,
    markShoppingBought,
    addShopping,
    reopenShoppingItem,
    removeShoppingItem,
    removeBoughtHistoryByTitleKey,
    addTask,
    setTaskNotes,
    updateTask,
    deleteTask,
    setPetCompletion,
  } = usePersistedApp();
  const { t, locale, setLocale, formatAppError } = useI18n();
  const now = useNowTicker(60_000);
  const [tab, setTab] = useState<TabId>(() => {
    const fallback: TabId = "all";
    if (typeof window === "undefined") return fallback;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
    } catch {
      return fallback;
    }
    if (!raw) return fallback;
    if (raw === "all" || raw === "shop") return raw;
    if (isMemberId(raw)) return raw;
    return fallback;
  });
  const [taskBoardOpen, setTaskBoardOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [shopDraft, setShopDraft] = useState("");
  const [shopAssignee, setShopAssignee] = useState<MemberId>("anya");
  const [taskDraft, setTaskDraft] = useState("");
  const [taskSlot, setTaskSlot] = useState<TimeSlot>("any");
  const [taskDaily, setTaskDaily] = useState(false);
  const [freshTaskIds, setFreshTaskIds] = useState<Record<string, number>>({});
  const [doneConfirm, setDoneConfirm] = useState<DoneConfirmState | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<RemoveConfirmState | null>(null);
  const knownTaskIdsRef = useRef<Set<string> | null>(null);
  const flashTimeoutsRef = useRef<number[]>([]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, tab);
    } catch {
      // localStorage может быть недоступен (privacy mode); вкладка тогда просто не персистится.
    }
  }, [tab]);

  useEffect(() => {
    if (!state) return;
    const prevKnown = knownTaskIdsRef.current;
    const currentIds = new Set(state.tasks.map((t) => t.id));
    if (!prevKnown) {
      knownTaskIdsRef.current = currentIds;
      return;
    }
    const newIds = state.tasks.filter((t) => !prevKnown.has(t.id)).map((t) => t.id);
    if (newIds.length > 0) {
      const nowTs = Date.now();
      setFreshTaskIds((prev) => {
        const next = { ...prev };
        for (const id of newIds) next[id] = nowTs;
        return next;
      });
      const timeout = window.setTimeout(() => {
        setFreshTaskIds((prev) => {
          const next = { ...prev };
          let changed = false;
          for (const id of newIds) {
            if (next[id]) {
              delete next[id];
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      }, NEW_TASK_FLASH_MS);
      flashTimeoutsRef.current.push(timeout);
    }
    knownTaskIdsRef.current = currentIds;
  }, [state]);

  useEffect(() => {
    return () => {
      for (const timeout of flashTimeoutsRef.current) {
        window.clearTimeout(timeout);
      }
    };
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  if (!ready || !state) {
    if (initialError) {
      return (
        <div className="app-shell">
          <div className="sync-error-panel">
            <p>
              <strong>{t("sync.noServerBold")}</strong> — {formatAppError(initialError)}
            </p>
            <p className="sync-error-hint">{t("sync.hint")} <code>npm run dev</code>.</p>
            <button type="button" className="btn btn-primary" onClick={() => void retryLoad()}>
              {t("sync.retry")}
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="app-shell">
        <div className="loading">{t("loading")}</div>
      </div>
    );
  }

  const dk = dateKey(now);
  const phase = getDayPhase(now);
  const virtualPets = buildVirtualPetTasks(dk, now, state.petCompletions, (key) => t(key));
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const shoppingOrdered = sortShoppingForDisplay(state.shopping);
  const repurchase = getRepurchaseCandidates(state.shopping);
  const activeMember = isMemberId(tab) ? tab : null;

  const rowsForMember = (member: MemberId): { now: Row[]; later: Row[] } => {
    const tasks = state.tasks.filter((t) => t.assignee === member);
    const pets = virtualPets.filter((v) => v.assignee === member);
    const memberShops = state.shopping.filter((s) => s.assignee === member);

    const nowRows: Row[] = [];
    const laterRows: Row[] = [];

    for (const t of tasks) {
      const row: Row = { kind: "task", task: t };
      const eff = getEffectiveTaskStatus(t, dk);
      const inNowWindow =
        eff === "planned" ? taskRelevantNow(t, phase, dk, now) : taskRelevantWindow(t, phase, dk, now);
      if (eff === "planned" && inNowWindow) {
        nowRows.push(row);
      } else if (eff === "planned" && !inNowWindow) {
        laterRows.push(row);
      } else if (
        (eff === "done" || eff === "skipped" || eff === "deferred") &&
        inNowWindow
      ) {
        nowRows.push(row);
      } else if (eff === "done" || eff === "skipped" || eff === "deferred") {
        laterRows.push(row);
      }
    }
    for (const v of pets) {
      const row: Row = { kind: "pet", pet: v };
      const rel =
        v.status === "planned" ? petTaskRelevantNow(v, phase, nowMin) : petRelevantWindow(v, phase, nowMin);
      if (v.status === "planned" && rel) {
        nowRows.push(row);
      } else if (v.status === "planned" && !rel) {
        laterRows.push(row);
      } else if (v.status === "done" && rel) {
        nowRows.push(row);
      } else if (v.status === "done" && !rel) {
        laterRows.push(row);
      } else if (v.status === "skipped" && rel) {
        nowRows.push(row);
      } else if (v.status === "skipped" && !rel) {
        laterRows.push(row);
      }
    }
    for (const item of memberShops) {
      nowRows.push({ kind: "shop", item });
    }

    return { now: nowRows, later: sortLaterRows(laterRows, locale) };
  };

  const onDonePet = (pet: VirtualPetTask) => {
    setPetCompletion(pet.id, "done");
  };

  const onRequestUndoPet = (pet: VirtualPetTask) => {
    setDoneConfirm({ kind: "pet", id: pet.id, title: pet.title });
  };

  const onSkipPetWalk = (pet: VirtualPetTask) => {
    setPetCompletion(pet.id, "skipped");
    showToast(t("toasts.walkSkipped"));
  };

  const onDoneTask = (task: Task) => {
    setTaskStatus(task.id, "done");
  };

  const onRequestUndoTask = (task: Task) => {
    setDoneConfirm({ kind: "task", id: task.id, title: task.title });
  };

  const onBought = (item: ShoppingItem) => {
    markShoppingBought(item.id);
    showToast(t("toasts.boughtHome", { title: item.title }));
  };

  const onRequestUndoShopping = (item: ShoppingItem) => {
    setDoneConfirm({ kind: "shop", id: item.id, title: item.title });
  };

  const onRemoveShop = (item: ShoppingItem) => {
    setRemoveConfirm({ kind: "shop", id: item.id, title: item.title });
  };

  const submitShop = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopDraft.trim()) return;
    addShopping(shopDraft, shopAssignee);
    setShopDraft("");
    showToast(t("toasts.shopAdded"));
  };

  const submitTask = (e: React.FormEvent, member: MemberId) => {
    e.preventDefault();
    if (!taskDraft.trim()) return;
    const daily = taskDaily;
    addTask(taskDraft, member, taskSlot, daily ? { recurrence: "daily" } : undefined);
    setTaskDraft("");
    setTaskDaily(false);
    showToast(daily ? t("toasts.taskAddedDaily") : t("toasts.taskAdded"));
  };

  return (
    <div className="app-shell">
      {saveError ? (
        <div className="save-error-banner" role="alert">
          <span>{t("saveBanner")} {formatAppError(saveError)}</span>
          <button type="button" className="linkish" onClick={dismissSaveError}>
            {t("dismiss")}
          </button>
        </div>
      ) : null}
      <header className="app-header">
        <div className="brand">
          <img src={publicAsset("images/house.svg")} alt="" width={48} height={48} />
          <div>
            <h1>{t("brand.title")}</h1>
            <p>{t("brand.tagline")}</p>
          </div>
        </div>
        <div className="header-actions">
          <div className="phase-pill" title={phaseTimeRange(phase)}>
            <IconClock size={16} />
            {t(`phase.${phase}`)}
          </div>
          <label className="lang-picker">
            <span className="visually-hidden">{t("lang.label")}</span>
            <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)} aria-label={t("lang.label")}>
              <option value="en">{t("lang.en")}</option>
              <option value="ru">{t("lang.ru")}</option>
            </select>
          </label>
        </div>
      </header>

      <nav className="tabs" role="tablist" aria-label={t("tabs.ariaSections")}>
        <div className="tabs-row tabs-row--primary">
          <button type="button" className="tab tab-all" role="tab" aria-selected={tab === "all"} onClick={() => setTab("all")}>
            <IconUsers size={16} className="tab-icon" />
            {t("tabs.all")}
          </button>
          <button
            type="button"
            className="tab tab-shop"
            role="tab"
            aria-selected={tab === "shop"}
            onClick={() => setTab("shop")}
            style={{ borderColor: tab === "shop" ? "var(--accent-2)" : undefined }}
          >
            <IconCart size={16} className="tab-icon" />
            {t("tabs.shop")}
          </button>
          <button type="button" className="tab tab-tasks" onClick={() => setTaskBoardOpen(true)} title={t("tabs.tasksTitle")}>
            <IconListChecks size={16} className="tab-icon" />
            {t("tabs.tasks")}
          </button>
        </div>
        <div className="tabs-row tabs-row--members">
          {MEMBERS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              className="tab"
              title={`${t(`memberRoles.${m.id}`)} — ${m.fullName}`}
              aria-selected={tab === m.id}
              onClick={() => setTab(m.id)}
              style={{ borderColor: tab === m.id ? m.color : undefined }}
            >
              {m.shortName}
            </button>
          ))}
        </div>
      </nav>

      {tab === "all" ? (
        <section aria-label={t("overview.ariaFamily")}>
          <div className="card">
            <h2>
              <IconUsers size={18} /> {t("overview.currentHeading")}
            </h2>
            <p className="section-hint">
              {t("overview.currentHintBefore")} <strong>{t(`phase.${phase}`)}</strong> {t("overview.currentHintMiddle")}{" "}
              <strong>{t("tabs.shop")}</strong>.
            </p>
            {MEMBERS.map((m) => {
              const { now: memberNowRows } = rowsForMember(m.id);
              const work = memberNowRows.filter((r) => r.kind === "task" || r.kind === "pet");
              return (
                <div key={m.id} className="member-now-block" style={{ borderLeft: `4px solid ${m.color}` }}>
                  <div className="member-now-header">
                    <h3 className="member-now-title">{m.shortName}</h3>
                    <button type="button" className="member-now-jump" onClick={() => setTab(m.id)}>
                      {t("overview.memberAllTasks")}
                    </button>
                  </div>
                  <p className="member-now-sub">
                    {t(`memberRoles.${m.id}`)} · {m.fullName}
                  </p>
                  {work.length === 0 ? (
                    <p className="empty member-now-empty">{t("overview.memberNowEmpty")}</p>
                  ) : (
                    work.map((r) => (
                      <RowView
                        key={r.kind === "task" ? r.task.id : r.pet.id}
                        row={r}
                        isFreshTask={r.kind === "task" ? Boolean(freshTaskIds[r.task.id]) : false}
                        dayKey={dk}
                        asOf={now}
                        onSetTaskNotes={setTaskNotes}
                        onDoneTask={onDoneTask}
                        onDonePet={onDonePet}
                        onRequestUndoPet={onRequestUndoPet}
                        onSkipPetWalk={onSkipPetWalk}
                        onBought={onBought}
                        onRequestUndoTask={onRequestUndoTask}
                        onRequestUndoShopping={onRequestUndoShopping}
                      />
                    ))
                  )}
                </div>
              );
            })}
          </div>

        </section>
      ) : tab === "shop" ? (
        <section aria-label={t("shopTab.aria")} className="shop-tab">
          <div className="card">
            <h2>
              <IconCart size={18} /> {t("shopTab.headingAll")}
            </h2>
            <p className="section-hint">{t("shopTab.hintAfterBuy")}</p>
            {state.shopping.length === 0 ? (
              <div className="empty">{t("shopTab.empty")}</div>
            ) : (
              shoppingOrdered.map((item) => (
                <RowView
                  key={item.id}
                  row={{ kind: "shop", item }}
                  isFreshTask={false}
                  dayKey={dk}
                  asOf={now}
                  onSetTaskNotes={setTaskNotes}
                  onDoneTask={onDoneTask}
                  onDonePet={onDonePet}
                  onRequestUndoPet={onRequestUndoPet}
                  onSkipPetWalk={onSkipPetWalk}
                  onBought={onBought}
                  onRequestUndoTask={onRequestUndoTask}
                  onRequestUndoShopping={onRequestUndoShopping}
                  onRemoveShop={onRemoveShop}
                />
              ))
            )}
          </div>

          {repurchase.length > 0 ? (
            <div className="card repurchase-card">
              <h2>{t("shopTab.buyAgainHeading")}</h2>
              <p className="section-hint">{t("shopTab.buyAgainHint")}</p>
              <ul className="repurchase-list" aria-label={t("shopTab.buyAgainAria")}>
                {repurchase.map((c) => {
                  const mem = MEMBERS.find((x) => x.id === c.assignee);
                  return (
                    <li key={c.key} className="repurchase-row">
                      <div className="repurchase-text">
                        <span className="repurchase-title">{c.title}</span>
                        <span className="repurchase-meta" style={{ color: mem?.color }}>
                          {mem?.shortName}
                        </span>
                      </div>
                      <div className="repurchase-actions">
                        <button
                          type="button"
                          className="btn btn-ghost row-remove-shop"
                          title={t("shopTab.dontSuggestTitle")}
                          aria-label={t("shopTab.dontSuggestAria")}
                          onClick={() => {
                            setRemoveConfirm({ kind: "repurchase", key: c.key, title: c.title });
                          }}
                        >
                          <IconTrash size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => {
                            reopenShoppingItem(c.id);
                            showToast(t("toasts.repurchaseOpen", { title: c.title }));
                          }}
                        >
                          <IconPlus size={16} />
                          {t("shopTab.backToList")}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <div className="card">
            <h2>
              <IconPlus size={18} /> {t("shopTab.addHeading")}
            </h2>
            <p className="section-hint">{t("shopTab.addHint")}</p>
            <form className="forms" onSubmit={submitShop}>
              <div className="input-row">
                <input
                  value={shopDraft}
                  onChange={(e) => setShopDraft(e.target.value)}
                  placeholder={t("shopTab.placeholderNewItem")}
                  aria-label={t("shopTab.ariaNewItem")}
                />
                <select value={shopAssignee} onChange={(e) => setShopAssignee(e.target.value as MemberId)} aria-label={t("shopTab.ariaAssigneeToTasks")}>
                  {MEMBERS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {t("shopTab.willBuyPrefix")} {m.shortName}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn btn-primary">
                  <IconPlus size={16} /> {t("shopTab.addButton")}
                </button>
              </div>
            </form>
          </div>
        </section>
      ) : activeMember ? (
        <PersonSection
          member={activeMember}
          freshTaskIds={freshTaskIds}
          dayKey={dk}
          asOf={now}
          phase={phase}
          rowsForMember={rowsForMember(activeMember)}
          onDoneTask={onDoneTask}
          onDonePet={onDonePet}
          onRequestUndoPet={onRequestUndoPet}
          onSkipPetWalk={onSkipPetWalk}
          onBought={onBought}
          onRequestUndoTask={onRequestUndoTask}
          onRequestUndoShopping={onRequestUndoShopping}
          onRemoveShop={onRemoveShop}
          taskDraft={taskDraft}
          setTaskDraft={setTaskDraft}
          taskSlot={taskSlot}
          setTaskSlot={setTaskSlot}
          taskDaily={taskDaily}
          setTaskDaily={setTaskDaily}
          onSetTaskNotes={setTaskNotes}
          onSubmitTask={(e) => submitTask(e, activeMember)}
        />
      ) : (
        <section aria-label={t("overview.ariaFamily")}>
          <div className="card">
            <p className="empty">{t("badTab.message")}</p>
            <button type="button" className="btn btn-primary" onClick={() => setTab("all")}>
              {t("badTab.openAll")}
            </button>
          </div>
        </section>
      )}

      <div className="footer-actions">
        <span className="badge" title={t("footer.serverBadgeTitle")}>
          {t("footer.serverBadgePrefix")}{" "}
          {now.toLocaleTimeString(locale === "ru" ? "ru-RU" : "en-US", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      {doneConfirm ? (
        <div className="confirm-backdrop" role="presentation" onClick={() => setDoneConfirm(null)}>
          <div
            className="confirm-dialog card"
            role="dialog"
            aria-modal="true"
            aria-label={t("doneConfirm.aria")}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{t("doneConfirm.title")}</h3>
            <p className="section-hint">
              {(doneConfirm.kind === "task"
                ? t("doneConfirm.undoTask")
                : doneConfirm.kind === "pet"
                  ? t("doneConfirm.undoPet")
                  : t("doneConfirm.undoShop"))}{" "}
              {t("doneConfirm.quotedSuffix", { title: doneConfirm.title })}
            </p>
            <div className="confirm-actions">
              <button
                type="button"
                className="btn btn-cancel-done"
                onClick={() => {
                  if (doneConfirm.kind === "task") {
                    setTaskStatus(doneConfirm.id, "planned");
                    showToast(t("doneConfirm.toastTask"));
                  } else if (doneConfirm.kind === "pet") {
                    setPetCompletion(doneConfirm.id, "planned");
                    showToast(t("doneConfirm.toastPet"));
                  } else {
                    reopenShoppingItem(doneConfirm.id);
                    showToast(t("doneConfirm.toastShop"));
                  }
                  setDoneConfirm(null);
                }}
              >
                {t("doneConfirm.confirmUndo")}
              </button>
              <button type="button" className="btn btn-keep-done" onClick={() => setDoneConfirm(null)}>
                {t("doneConfirm.keepDone")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {removeConfirm ? (
        <div className="confirm-backdrop" role="presentation" onClick={() => setRemoveConfirm(null)}>
          <div
            className="confirm-dialog card"
            role="dialog"
            aria-modal="true"
            aria-label={t("removeConfirm.aria")}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{t("removeConfirm.title")}</h3>
            <p className="section-hint">
              {removeConfirm.kind === "shop"
                ? t("removeConfirm.shopBody", { title: removeConfirm.title })
                : t("removeConfirm.repurchaseBody", { title: removeConfirm.title })}
            </p>
            <div className="confirm-actions">
              <button
                type="button"
                className="btn btn-cancel-done"
                onClick={() => {
                  if (removeConfirm.kind === "shop") {
                    removeShoppingItem(removeConfirm.id);
                    showToast(t("removeConfirm.toastShopRemoved"));
                  } else {
                    removeBoughtHistoryByTitleKey(removeConfirm.key);
                    showToast(t("removeConfirm.toastRepurchaseRemoved", { title: removeConfirm.title }));
                  }
                  setRemoveConfirm(null);
                }}
              >
                {t("removeConfirm.confirmRemove")}
              </button>
              <button type="button" className="btn btn-keep-done" onClick={() => setRemoveConfirm(null)}>
                {t("removeConfirm.keep")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="toast" role="status">{toast}</div> : null}

      <TasksManageDialog
        open={taskBoardOpen}
        onClose={() => setTaskBoardOpen(false)}
        tasks={state.tasks}
        dayKey={dk}
        onUpdate={(id, data) => {
          updateTask(id, {
            title: data.title,
            assignee: data.assignee,
            slot: data.slot,
            notes: data.notes,
            status: data.status,
            daily: data.daily,
          });
          showToast(t("toasts.taskSaved"));
        }}
        onDelete={(id) => {
          deleteTask(id);
          showToast(t("toasts.taskDeleted"));
        }}
      />
    </div>
  );
}

function PersonSection({
  member,
  freshTaskIds,
  dayKey,
  asOf,
  phase,
  rowsForMember,
  onDoneTask,
  onDonePet,
  onRequestUndoPet,
  onSkipPetWalk,
  onBought,
  onRequestUndoTask,
  onRequestUndoShopping,
  onRemoveShop,
  taskDraft,
  setTaskDraft,
  taskSlot,
  setTaskSlot,
  taskDaily,
  setTaskDaily,
  onSetTaskNotes,
  onSubmitTask,
}: {
  member: MemberId;
  freshTaskIds: Record<string, number>;
  dayKey: string;
  asOf: Date;
  phase: ReturnType<typeof getDayPhase>;
  rowsForMember: { now: Row[]; later: Row[] };
  onDoneTask: (t: Task) => void;
  onDonePet: (p: VirtualPetTask) => void;
  onRequestUndoPet: (p: VirtualPetTask) => void;
  onSkipPetWalk: (p: VirtualPetTask) => void;
  onBought: (s: ShoppingItem) => void;
  onRequestUndoTask: (t: Task) => void;
  onRequestUndoShopping: (s: ShoppingItem) => void;
  onRemoveShop: (s: ShoppingItem) => void;
  taskDraft: string;
  setTaskDraft: (s: string) => void;
  taskSlot: TimeSlot;
  setTaskSlot: (s: TimeSlot) => void;
  taskDaily: boolean;
  setTaskDaily: (v: boolean) => void;
  onSetTaskNotes: (id: string, n: string) => void;
  onSubmitTask: (e: React.FormEvent) => void;
}) {
  const { t } = useI18n();
  const m = MEMBERS.find((x) => x.id === member)!;
  const { now: nowRows, later: laterRows } = rowsForMember;

  return (
    <section aria-label={m.fullName}>
      <div className="card" style={{ borderLeft: `4px solid ${m.color}` }}>
        <h2>
          {m.shortName}
          <span className="badge" style={{ marginLeft: 8 }} title={m.fullName}>
            {t(`memberRoles.${m.id}`)}
          </span>
        </h2>
        <p className="section-hint">
          {t("personView.personalHint")} <strong>{t(`phase.${phase}`)}</strong>
        </p>
      </div>

      <div className="card">
        <h2>
          <IconClock size={18} /> {t("personView.nowHeading")}
        </h2>
        <p className="section-hint">{t("personView.nowHint")}</p>
        {nowRows.length === 0 ? (
          <div className="empty">{t("personView.nowEmpty")}</div>
        ) : (
          nowRows.map((r) => (
            <RowView
              key={
                r.kind === "task"
                  ? r.task.id
                  : r.kind === "pet"
                    ? r.pet.id
                    : `shop-${r.item.id}`
              }
              row={r}
              isFreshTask={r.kind === "task" ? Boolean(freshTaskIds[r.task.id]) : false}
              dayKey={dayKey}
              asOf={asOf}
              onSetTaskNotes={onSetTaskNotes}
              onDoneTask={onDoneTask}
              onDonePet={onDonePet}
              onRequestUndoPet={onRequestUndoPet}
              onSkipPetWalk={onSkipPetWalk}
              onBought={onBought}
              onRequestUndoTask={onRequestUndoTask}
              onRequestUndoShopping={onRequestUndoShopping}
              onRemoveShop={onRemoveShop}
            />
          ))
        )}
      </div>

      <div className="card">
        <h2>{t("personView.laterHeading")}</h2>
        <p className="section-hint">{t("personView.laterHint")}</p>
        {laterRows.length === 0 ? (
          <div className="empty">{t("personView.laterEmpty")}</div>
        ) : (
          laterRows.map((r) => (
            <RowView
              key={
                r.kind === "task"
                  ? r.task.id
                  : r.kind === "pet"
                    ? r.pet.id
                    : `shop-${r.item.id}`
              }
              row={r}
              isFreshTask={r.kind === "task" ? Boolean(freshTaskIds[r.task.id]) : false}
              dayKey={dayKey}
              asOf={asOf}
              onSetTaskNotes={onSetTaskNotes}
              onDoneTask={onDoneTask}
              onDonePet={onDonePet}
              onRequestUndoPet={onRequestUndoPet}
              onSkipPetWalk={onSkipPetWalk}
              onBought={onBought}
              onRequestUndoTask={onRequestUndoTask}
              onRequestUndoShopping={onRequestUndoShopping}
              onRemoveShop={onRemoveShop}
            />
          ))
        )}
      </div>

      <div className="card">
        <h2>
          <IconPlus size={18} /> {t("personView.quickTaskHeading")}
        </h2>
        <form className="forms" onSubmit={onSubmitTask}>
          <div className="input-row">
            <input value={taskDraft} onChange={(e) => setTaskDraft(e.target.value)} placeholder={t("personView.quickTaskPlaceholder")} />
            <select value={taskSlot} onChange={(e) => setTaskSlot(e.target.value as TimeSlot)}>
              <option value="morning">{t("slots.morning")}</option>
              <option value="day">{t("slots.day")}</option>
              <option value="evening">{t("slots.evening")}</option>
              <option value="night">{t("slots.night")}</option>
              <option value="any">{t("slots.any")}</option>
            </select>
            <button type="submit" className="btn btn-primary">
              {t("personView.quickTaskSubmit")}
            </button>
          </div>
          <label className="checkbox-line">
            <input type="checkbox" checked={taskDaily} onChange={(e) => setTaskDaily(e.target.checked)} />
            {t("personView.dailyCheckbox")}
          </label>
        </form>
      </div>
    </section>
  );
}

function TaskItemRow({
  task,
  eff,
  slotMissed,
  isFreshTask,
  onDone,
  onRequestUndoTask,
  onSetTaskNotes,
}: {
  task: Task;
  eff: TaskStatus;
  slotMissed: boolean;
  isFreshTask: boolean;
  onDone: () => void;
  onRequestUndoTask: (task: Task) => void;
  onSetTaskNotes: (id: string, n: string) => void;
}) {
  const { t } = useI18n();
  const [notesOpen, setNotesOpen] = useState(false);
  const [draft, setDraft] = useState(task.notes ?? "");

  useEffect(() => {
    setDraft(task.notes ?? "");
  }, [task.id, task.notes]);

  const hasNotes = Boolean(task.notes?.trim());
  const slotShort = t(`slots.slotHintShort.${task.slot}`);
  return (
    <div className={isFreshTask ? "row row--task row--task-fresh" : "row row--task"}>
      <div>
        <div className="row-title">{task.title}</div>
        <div className="row-meta">
          {t("taskRow.metaSlot", { slot: slotShort })}
          {task.recurrence === "daily" ? (
            <span className="badge badge-daily" title={t("statusLabels.dailyRepeatTitle")}>
              {t("tasksManage.dailyBadge")}
            </span>
          ) : null}
        </div>
        {hasNotes ? <p className="row-note">{task.notes}</p> : null}
        {notesOpen ? (
          <div className="task-notes-edit">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              placeholder={t("taskRow.notesPlaceholder")}
              aria-label={t("taskRow.notesAria")}
            />
            <div className="task-notes-edit-actions">
              <button type="button" className="btn btn-ghost" onClick={() => onSetTaskNotes(task.id, draft)}>
                <IconCheck size={16} />
                {t("taskRow.saveNotes")}
              </button>
              <button type="button" className="linkish" onClick={() => setNotesOpen(false)}>
                {t("taskRow.close")}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="linkish task-note-toggle" onClick={() => setNotesOpen(true)}>
            {hasNotes ? t("taskRow.editNotes") : t("taskRow.addNotes")}
          </button>
        )}
      </div>
      <div className="row-actions row-actions--task">
        {eff === "planned" ? (
          <>
            <span
              className={slotMissed ? "status-pill status-pill--missed" : "status-pill status-pill--pending"}
              title={slotMissed ? t("statusLabels.slotMissedTitle") : t("statusLabels.statusGeneric")}
            >
              {slotMissed ? t("statusLabels.missedSlot") : t("statusLabels.pendingActivity")}
            </span>
            <button type="button" className="btn btn-ghost" onClick={onDone}>
              <IconCheck size={16} />
              {t("taskRow.done")}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="status-pill status-pill--done status-pill-button task-done-status-left"
            aria-label={t("taskRow.undoDoneAria")}
            onClick={() => onRequestUndoTask(task)}
          >
            <IconCheck size={16} className="status-pill__icon" />
            {task.recurrence === "daily" ? t("taskRow.doneToday") : t("taskRow.done")}
          </button>
        )}
      </div>
    </div>
  );
}

function RowView({
  row,
  isFreshTask,
  dayKey,
  asOf = new Date(),
  onSetTaskNotes,
  onDoneTask,
  onDonePet,
  onRequestUndoPet,
  onSkipPetWalk,
  onBought,
  onRequestUndoTask,
  onRequestUndoShopping,
  onRemoveShop,
}: {
  row: Row;
  isFreshTask: boolean;
  dayKey: string;
  asOf?: Date;
  onSetTaskNotes: (id: string, n: string) => void;
  onDoneTask: (t: Task) => void;
  onDonePet: (p: VirtualPetTask) => void;
  onRequestUndoPet: (p: VirtualPetTask) => void;
  onSkipPetWalk: (p: VirtualPetTask) => void;
  onBought: (s: ShoppingItem) => void;
  onRequestUndoTask: (t: Task) => void;
  onRequestUndoShopping: (s: ShoppingItem) => void;
  onRemoveShop?: (s: ShoppingItem) => void;
}) {
  const { t } = useI18n();
  if (row.kind === "shop") {
    const { item } = row;
    const isBought = item.status === "bought";
    const who = MEMBERS.find((m) => m.id === item.assignee);
    return (
      <div className={isBought ? "row row--shop-bought" : "row row--shop-open"}>
        <div>
          <div className="row-title">
            <IconCart size={16} className="row-icon row-icon--shop" />
            {item.title}
          </div>
          <div className="row-meta">
            {t("shopRow.purchaseMeta")}{" "}
            {who ? (
              <>
                {t("shopRow.buysStrong")} <strong style={{ color: who.color }}>{who.shortName}</strong>
              </>
            ) : (
              t("shopRow.familyFallback")
            )}
          </div>
        </div>
        <div className="row-actions">
          {isBought ? (
            <button
              type="button"
              className="status-pill status-pill--done status-pill-button"
              aria-label={t("shopRow.boughtAria")}
              onClick={() => onRequestUndoShopping(item)}
            >
              <IconCheck size={16} className="status-pill__icon" />
              {t("shopRow.boughtStatus")}
            </button>
          ) : (
            <div className="shop-open-layout">
              {onRemoveShop ? (
                <button
                  type="button"
                  className="btn btn-ghost row-remove-shop"
                  title={t("shopRow.removeTitle")}
                  aria-label={t("shopRow.removeAria")}
                  onClick={() => onRemoveShop(item)}
                >
                  <IconTrash size={16} />
                </button>
              ) : null}
              <div className="shop-open-right">
                <span className="status-pill status-pill--pending" title={t("shopRow.pendingBuyTitle")}>
                  {t("statusLabels.pendingShopping")}
                </span>
                <button type="button" className="status-pill status-pill--pending shop-open-buy" onClick={() => onBought(item)}>
                  <IconCheck size={16} />
                  {t("shopRow.boughtButton")}
                </button>
              </div>
            </div>
          )}
          {isBought && onRemoveShop ? (
            <button
              type="button"
              className="btn btn-ghost row-remove-shop"
              title={t("shopRow.removeTitle")}
              aria-label={t("shopRow.removeAria")}
              onClick={() => onRemoveShop(item)}
            >
              <IconTrash size={16} />
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (row.kind === "task") {
    const { task } = row;
    const eff = getEffectiveTaskStatus(task, dayKey);
    const slotMissed = isTaskSlotMissedToday(task, asOf, dayKey);
    return (
      <TaskItemRow
        task={task}
        eff={eff}
        slotMissed={slotMissed}
        isFreshTask={isFreshTask}
        onDone={() => onDoneTask(task)}
        onRequestUndoTask={onRequestUndoTask}
        onSetTaskNotes={onSetTaskNotes}
      />
    );
  }

  const { pet } = row;
  const isWalk = pet.kind === "walk";
  const PetIcon = pet.species === "dog" ? IconDog : IconCat;
  return (
    <div className="row">
      <div>
        <div className="row-title">
          <PetIcon size={16} className="row-icon row-icon--pet" />
          {pet.title}
        </div>
        <div className="row-meta">
          {t("petRow.planPrefix")} {formatPlanTime(pet.plannedMinutes)}
          {pet.kind === "feed" && pet.inFeedWindow ? (
            <span className="badge badge-feed-window" style={{ marginLeft: 6 }}>
              {t("statusLabels.feedWindow")}
            </span>
          ) : null}
          {isWalk ? (
            <span className="badge badge-soft" style={{ marginLeft: 6 }}>
              {t("statusLabels.walkSoft")}
            </span>
          ) : null}
        </div>
      </div>
      <div className="row-actions row-actions--task">
        {pet.status === "planned" ? (
          <>
            <span className="status-pill status-pill--pending" title={t("statusLabels.statusGeneric")}>
              {t("statusLabels.pendingActivity")}
            </span>
            <button type="button" className="btn btn-ghost" onClick={() => onDonePet(pet)}>
              <IconCheck size={16} />
              {t("petRow.petDone")}
            </button>
            {isWalk ? (
              <button type="button" className="btn btn-warn" onClick={() => onSkipPetWalk(pet)} title={t("petRow.walkSkipTitle")}>
                <IconSkip size={16} />
                {t("petRow.skipWalk")}
              </button>
            ) : null}
          </>
        ) : pet.status === "skipped" ? (
          <button
            type="button"
            className="status-pill status-pill--done status-pill-button task-done-status-left"
            aria-label={t("petRow.skipAria")}
            onClick={() => onRequestUndoPet(pet)}
          >
            <IconSkip size={16} className="status-pill__icon" />
            {t("petRow.skipWalk")}
          </button>
        ) : (
          <button
            type="button"
            className="status-pill status-pill--done status-pill-button task-done-status-left"
            aria-label={t("petRow.walkDoneAria")}
            onClick={() => onRequestUndoPet(pet)}
          >
            <IconCheck size={16} className="status-pill__icon" />
            {t("petRow.petDone")}
          </button>
        )}
      </div>
    </div>
  );
}
