import { useCallback, useEffect, useState } from "react";
import { MEMBERS, MISSED_SLOT_LABEL, PENDING_ACTIVITY_LABEL, PENDING_SHOPPING_LABEL } from "./constants";
import { IconCart, IconCheck, IconClock, IconCat, IconDog, IconListChecks, IconPlus, IconSkip, IconTrash, IconUsers } from "./components/Icons";
import { TasksManageDialog } from "./components/TasksManageDialog";
import { usePersistedApp } from "./hooks/usePersistedApp";
import { publicAsset } from "./paths";
import { petRelevantWindow, petTaskRelevantNow, taskRelevantNow, taskRelevantWindow } from "./logic/relevance";
import { isTaskSlotMissedToday } from "./logic/slotMissed";
import { getRepurchaseCandidates, sortShoppingForDisplay } from "./logic/shoppingList";
import { getEffectiveTaskStatus } from "./logic/taskDay";
import { buildVirtualPetTasks, formatPlanTime } from "./logic/pets";
import { getDayPhase, phaseLabel, phaseTimeRange } from "./logic/time";
import type { MemberId, ShoppingItem, TabId, Task, TaskStatus, TimeSlot, VirtualPetTask } from "./types";

function dateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

type Row =
  | { kind: "task"; task: Task }
  | { kind: "pet"; pet: VirtualPetTask }
  | { kind: "shop"; item: ShoppingItem };

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

function sortLaterRows(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => {
    const ka = laterRowSortKey(a);
    const kb = laterRowSortKey(b);
    if (ka.phase !== kb.phase) return ka.phase - kb.phase;
    if (ka.minute !== kb.minute) return ka.minute - kb.minute;
    return ka.title.localeCompare(kb.title, "ru");
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
    resetDemo,
  } = usePersistedApp();
  const now = useNowTicker(60_000);
  const [tab, setTab] = useState<TabId>("all");
  const [taskBoardOpen, setTaskBoardOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [shopDraft, setShopDraft] = useState("");
  const [shopAssignee, setShopAssignee] = useState<MemberId>("anya");
  const [taskDraft, setTaskDraft] = useState("");
  const [taskSlot, setTaskSlot] = useState<TimeSlot>("any");
  const [taskDaily, setTaskDaily] = useState(false);

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
              <strong>Нет связи с сервером</strong> — {initialError}
            </p>
            <p className="sync-error-hint">Нужен запущенный API (см. README). Команда: <code>npm run dev</code>.</p>
            <button type="button" className="btn btn-primary" onClick={() => void retryLoad()}>
              Повторить
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="app-shell">
        <div className="loading">Загружаем дом…</div>
      </div>
    );
  }

  const dk = dateKey(now);
  const phase = getDayPhase(now);
  const virtualPets = buildVirtualPetTasks(dk, now, state.petCompletions);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const shoppingOrdered = sortShoppingForDisplay(state.shopping);
  const repurchase = getRepurchaseCandidates(state.shopping);

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

    return { now: nowRows, later: sortLaterRows(laterRows) };
  };

  const onDonePet = (pet: VirtualPetTask) => {
    setPetCompletion(pet.id, "done");
  };

  const onSkipPetWalk = (pet: VirtualPetTask) => {
    setPetCompletion(pet.id, "skipped");
    showToast("Ок — один прогулочный слот можно не брать в зачёт дня. Всё под контролем.");
  };

  const onDoneTask = (task: Task) => {
    setTaskStatus(task.id, "done");
  };

  const onBought = (item: ShoppingItem) => {
    markShoppingBought(item.id);
    showToast(`«${item.title}» — в корзине дома.`);
  };

  const onRemoveShop = (item: ShoppingItem) => {
    removeShoppingItem(item.id);
    showToast("Позиция убрана из списка.");
  };

  const submitShop = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopDraft.trim()) return;
    addShopping(shopDraft, shopAssignee);
    setShopDraft("");
    showToast("Пункт добавлен в общий список.");
  };

  const submitTask = (e: React.FormEvent, member: MemberId) => {
    e.preventDefault();
    if (!taskDraft.trim()) return;
    const daily = taskDaily;
    addTask(taskDraft, member, taskSlot, daily ? { recurrence: "daily" } : undefined);
    setTaskDraft("");
    setTaskDaily(false);
    showToast(daily ? "Задача на каждый день добавлена." : "Задача добавлена.");
  };

  return (
    <div className="app-shell">
      {saveError ? (
        <div className="save-error-banner" role="alert">
          <span>Не удалось сохранить на сервер: {saveError}</span>
          <button type="button" className="linkish" onClick={dismissSaveError}>
            Скрыть
          </button>
        </div>
      ) : null}
      <header className="app-header">
        <div className="brand">
          <img src={publicAsset("images/logo-mark.svg")} alt="" width={48} height={48} />
          <div>
            <h1>Дом и задачи</h1>
            <p>Семья · питомцы · покупки</p>
          </div>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="resume-link"
            onClick={() => setTaskBoardOpen(true)}
            title="Список задач: правка, удаление"
          >
            <IconListChecks size={16} className="header-pill-icon" />
            Задачи
          </button>
          <a className="resume-link" href="/resume/index.html" title="Открыть резюме">
            Резюме
          </a>
          <img className="hero-art" src={publicAsset("images/house.svg")} alt="" />
          <div className="phase-pill" title={phaseTimeRange(phase)}>
            <IconClock size={16} />
            {phaseLabel(phase)}
          </div>
        </div>
      </header>

      <nav className="tabs" role="tablist" aria-label="Разделы">
        <button type="button" className="tab tab-all" role="tab" aria-selected={tab === "all"} onClick={() => setTab("all")}>
          <IconUsers size={16} className="tab-icon" />
          Все
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
          Купить
        </button>
        {MEMBERS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            className="tab"
            title={`${m.role} — ${m.fullName}`}
            aria-selected={tab === m.id}
            onClick={() => setTab(m.id)}
            style={{ borderColor: tab === m.id ? m.color : undefined }}
          >
            {m.shortName}
          </button>
        ))}
      </nav>

      {tab === "all" ? (
        <section aria-label="Обзор семьи">
          <div className="card">
            <h2>
              <IconUsers size={18} /> Сейчас: актуальные дела
            </h2>
            <p className="section-hint">
              Поручения и питомцы по фазе дня: <strong>{phaseLabel(phase)}</strong> — список покупок на вкладке <strong>Купить</strong>
              .
            </p>
            {MEMBERS.map((m) => {
              const { now: memberNowRows } = rowsForMember(m.id);
              const work = memberNowRows.filter((r) => r.kind === "task" || r.kind === "pet");
              return (
                <div key={m.id} className="member-now-block" style={{ borderLeft: `4px solid ${m.color}` }}>
                  <div className="member-now-header">
                    <h3 className="member-now-title">{m.shortName}</h3>
                    <button type="button" className="member-now-jump" onClick={() => setTab(m.id)}>
                      Все дела
                    </button>
                  </div>
                  <p className="member-now-sub">
                    {m.role} · {m.fullName}
                  </p>
                  {work.length === 0 ? (
                    <p className="empty member-now-empty">Сейчас срочного нет.</p>
                  ) : (
                    work.map((r) => (
                      <RowView
                        key={r.kind === "task" ? r.task.id : r.pet.id}
                        row={r}
                        dayKey={dk}
                        asOf={now}
                        onSetTaskNotes={setTaskNotes}
                        onDoneTask={onDoneTask}
                        onDonePet={onDonePet}
                        onSkipPetWalk={onSkipPetWalk}
                        onBought={onBought}
                      />
                    ))
                  )}
                </div>
              );
            })}
          </div>

        </section>
      ) : tab === "shop" ? (
        <section aria-label="Список покупок" className="shop-tab">
          <div className="card">
            <h2>
              <IconCart size={18} /> Всё, что в списке
            </h2>
            <p className="section-hint">После «куплено» позиция строки не меняется, только статус. Ненужное можно убрать (иконка корзины).</p>
            {state.shopping.length === 0 ? (
              <div className="empty">Пока пусто — добавьте новый пункт в форме ниже.</div>
            ) : (
              shoppingOrdered.map((item) => (
                <RowView
                  key={item.id}
                  row={{ kind: "shop", item }}
                  dayKey={dk}
                  asOf={now}
                  onSetTaskNotes={setTaskNotes}
                  onDoneTask={onDoneTask}
                  onDonePet={onDonePet}
                  onSkipPetWalk={onSkipPetWalk}
                  onBought={onBought}
                  onRemoveShop={onRemoveShop}
                />
              ))
            )}
          </div>

          {repurchase.length > 0 ? (
            <div className="card repurchase-card">
              <h2>Купить ещё</h2>
              <p className="section-hint">Вернуть в открытый список купленное раньше (сейчас нет открытой строки с таким названием).</p>
              <ul className="repurchase-list" aria-label="Повторить покупку">
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
                          className="btn btn-ghost"
                          onClick={() => {
                            reopenShoppingItem(c.id);
                            showToast("«" + c.title + "» снова ожидает покупки.");
                          }}
                        >
                          <IconPlus size={16} />
                          Снова в список
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost repurchase-discard"
                          title="Больше не предлагать эту покупку"
                          onClick={() => {
                            removeBoughtHistoryByTitleKey(c.key);
                            showToast("«" + c.title + "» убрано из подсказок и истории.");
                          }}
                        >
                          <IconTrash size={16} />
                          Не покупать
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
              <IconPlus size={18} /> Добавить, что купить
            </h2>
            <p className="section-hint">Один список для семьи: кому купит — тому в «Сейчас» на личной вкладке.</p>
            <form className="forms" onSubmit={submitShop}>
              <div className="input-row">
                <input
                  value={shopDraft}
                  onChange={(e) => setShopDraft(e.target.value)}
                  placeholder="Например: молоко, корм для кота…"
                  aria-label="Новый пункт покупок"
                />
                <select value={shopAssignee} onChange={(e) => setShopAssignee(e.target.value as MemberId)} aria-label="Кому в задачи">
                  {MEMBERS.map((m) => (
                    <option key={m.id} value={m.id}>
                      Купит: {m.shortName}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn btn-primary">
                  <IconPlus size={16} /> В список
                </button>
              </div>
            </form>
          </div>
        </section>
      ) : (
        <PersonSection
          member={tab}
          dayKey={dk}
          asOf={now}
          phase={phase}
          rowsForMember={rowsForMember(tab)}
          onDoneTask={onDoneTask}
          onDonePet={onDonePet}
          onSkipPetWalk={onSkipPetWalk}
          onBought={onBought}
          onRemoveShop={onRemoveShop}
          taskDraft={taskDraft}
          setTaskDraft={setTaskDraft}
          taskSlot={taskSlot}
          setTaskSlot={setTaskSlot}
          taskDaily={taskDaily}
          setTaskDaily={setTaskDaily}
          onSetTaskNotes={setTaskNotes}
          onSubmitTask={(e) => submitTask(e, tab)}
        />
      )}

      <div className="footer-actions">
        <button type="button" className="linkish" onClick={resetDemo}>
          Сбросить демо-данные
        </button>
        <span className="badge" title="Общее состояние на сервере приложения">
          Сервер · {now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

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
          showToast("Задача сохранена.");
        }}
        onDelete={(id) => {
          deleteTask(id);
          showToast("Задача удалена.");
        }}
      />
    </div>
  );
}

function PersonSection({
  member,
  dayKey,
  asOf,
  phase,
  rowsForMember,
  onDoneTask,
  onDonePet,
  onSkipPetWalk,
  onBought,
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
  dayKey: string;
  asOf: Date;
  phase: ReturnType<typeof getDayPhase>;
  rowsForMember: { now: Row[]; later: Row[] };
  onDoneTask: (t: Task) => void;
  onDonePet: (p: VirtualPetTask) => void;
  onSkipPetWalk: (p: VirtualPetTask) => void;
  onBought: (s: ShoppingItem) => void;
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
  const m = MEMBERS.find((x) => x.id === member)!;
  const { now: nowRows, later: laterRows } = rowsForMember;

  return (
    <section aria-label={m.fullName}>
      <div className="card" style={{ borderLeft: `4px solid ${m.color}` }}>
        <h2>
          {m.shortName}
          <span className="badge" style={{ marginLeft: 8 }} title={m.fullName}>
            {m.role}
          </span>
        </h2>
        <p className="section-hint">
          Личный вид · фаза дня: <strong>{phaseLabel(phase)}</strong>
        </p>
      </div>

      <div className="card">
        <h2>
          <IconClock size={18} /> Актуально сейчас
        </h2>
        <p className="section-hint">Корм — строже (±1 ч к плану), прогулки — мягче. Покупки — на вкладке «Купить».</p>
        {nowRows.length === 0 ? (
          <div className="empty">Сейчас тихо — загляните в «Дальше по списку» или добавьте задачу.</div>
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
              dayKey={dayKey}
              asOf={asOf}
              onSetTaskNotes={onSetTaskNotes}
              onDoneTask={onDoneTask}
              onDonePet={onDonePet}
              onSkipPetWalk={onSkipPetWalk}
              onBought={onBought}
              onRemoveShop={onRemoveShop}
            />
          ))
        )}
      </div>

      <div className="card">
        <h2>Дальше по списку</h2>
        <p className="section-hint">Запланировано не на этот отрезок дня. После «готово» строка остаётся на месте, меняется только статус.</p>
        {laterRows.length === 0 ? (
          <div className="empty">Нет отложенных задач и ухода — отличный день.</div>
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
              dayKey={dayKey}
              asOf={asOf}
              onSetTaskNotes={onSetTaskNotes}
              onDoneTask={onDoneTask}
              onDonePet={onDonePet}
              onSkipPetWalk={onSkipPetWalk}
              onBought={onBought}
              onRemoveShop={onRemoveShop}
            />
          ))
        )}
      </div>

      <div className="card">
        <h2>
          <IconPlus size={18} /> Быстрая задача
        </h2>
        <form className="forms" onSubmit={onSubmitTask}>
          <div className="input-row">
            <input value={taskDraft} onChange={(e) => setTaskDraft(e.target.value)} placeholder="Что сделать?" />
            <select value={taskSlot} onChange={(e) => setTaskSlot(e.target.value as TimeSlot)}>
              <option value="morning">Утро</option>
              <option value="day">День</option>
              <option value="evening">Вечер</option>
              <option value="night">Почти ночь</option>
              <option value="any">В любое время</option>
            </select>
            <button type="submit" className="btn btn-primary">
              Добавить себе
            </button>
          </div>
          <label className="checkbox-line">
            <input type="checkbox" checked={taskDaily} onChange={(e) => setTaskDaily(e.target.checked)} />
            Каждый день (снова в плане после смены дня)
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
  onDone,
  onSetTaskNotes,
}: {
  task: Task;
  eff: TaskStatus;
  slotMissed: boolean;
  onDone: () => void;
  onSetTaskNotes: (id: string, n: string) => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [draft, setDraft] = useState(task.notes ?? "");

  useEffect(() => {
    setDraft(task.notes ?? "");
  }, [task.id, task.notes]);

  const hasNotes = Boolean(task.notes?.trim());
  return (
    <div className="row row--task">
      <div>
        <div className="row-title">{task.title}</div>
        <div className="row-meta">
          Задача · слот: {slotRu(task.slot)}
          {task.recurrence === "daily" ? (
            <span className="badge badge-daily" title="Повторяется каждый день">
              каждый день
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
              placeholder="Уточнения: что взять, куда, на сколько…"
              aria-label="Дополнение к задаче"
            />
            <div className="task-notes-edit-actions">
              <button type="button" className="btn btn-ghost" onClick={() => onSetTaskNotes(task.id, draft)}>
                <IconCheck size={16} />
                Сохранить
              </button>
              <button type="button" className="linkish" onClick={() => setNotesOpen(false)}>
                Закрыть
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="linkish task-note-toggle" onClick={() => setNotesOpen(true)}>
            {hasNotes ? "Изменить уточнения" : "Дополнить деталями"}
          </button>
        )}
      </div>
      <div className="row-actions">
        {eff === "planned" ? (
          <>
            <span
              className={slotMissed ? "status-pill status-pill--missed" : "status-pill status-pill--pending"}
              title={slotMissed ? "Слот прошёл, задача не закрыта" : "Статус"}
            >
              {slotMissed ? MISSED_SLOT_LABEL : PENDING_ACTIVITY_LABEL}
            </span>
            <button type="button" className="btn btn-ghost" onClick={onDone}>
              <IconCheck size={16} />
              Готово
            </button>
          </>
        ) : (
          <span className="status-pill status-pill--done" role="img" aria-label="Сделано сегодня">
            <IconCheck size={16} className="status-pill__icon" />
            {task.recurrence === "daily" ? "Сегодня сделано" : "Готово"}
          </span>
        )}
      </div>
    </div>
  );
}

function RowView({
  row,
  dayKey,
  asOf = new Date(),
  onSetTaskNotes,
  onDoneTask,
  onDonePet,
  onSkipPetWalk,
  onBought,
  onRemoveShop,
}: {
  row: Row;
  dayKey: string;
  asOf?: Date;
  onSetTaskNotes: (id: string, n: string) => void;
  onDoneTask: (t: Task) => void;
  onDonePet: (p: VirtualPetTask) => void;
  onSkipPetWalk: (p: VirtualPetTask) => void;
  onBought: (s: ShoppingItem) => void;
  onRemoveShop?: (s: ShoppingItem) => void;
}) {
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
            Покупка · {who ? <>купит: <strong style={{ color: who.color }}>{who.shortName}</strong></> : "семья"}
          </div>
        </div>
        <div className="row-actions">
          {isBought ? (
            <span className="status-pill status-pill--done" role="img" aria-label="Покупка оформлена">
              <IconCheck size={16} className="status-pill__icon" />
              Куплено
            </span>
          ) : (
            <>
              <span className="status-pill status-pill--pending" title="Ожидает покупки">
                {PENDING_SHOPPING_LABEL}
              </span>
              <button type="button" className="btn btn-ghost" onClick={() => onBought(item)}>
                <IconCheck size={16} />
                куплено
              </button>
            </>
          )}
          {onRemoveShop ? (
            <button
              type="button"
              className="btn btn-ghost row-remove-shop"
              title="Убрать из списка"
              aria-label="Убрать из списка"
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
        onDone={() => onDoneTask(task)}
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
          План: {formatPlanTime(pet.plannedMinutes)}
          {pet.kind === "feed" && pet.inFeedWindow ? (
            <span className="badge badge-feed-window" style={{ marginLeft: 6 }}>
              в окне ±1 ч
            </span>
          ) : null}
          {isWalk ? (
            <span className="badge badge-soft" style={{ marginLeft: 6 }}>
              мягкий сценарий
            </span>
          ) : null}
        </div>
      </div>
      <div className="row-actions">
        {pet.status === "planned" ? (
          <>
            <span className="status-pill status-pill--pending" title="Статус">
              {PENDING_ACTIVITY_LABEL}
            </span>
            <button type="button" className="btn btn-ghost" onClick={() => onDonePet(pet)}>
              <IconCheck size={16} />
              Сделано
            </button>
            {isWalk ? (
              <button type="button" className="btn btn-warn" onClick={() => onSkipPetWalk(pet)} title="Пропустить без стресса">
                <IconSkip size={16} />
                Пропуск
              </button>
            ) : null}
          </>
        ) : pet.status === "skipped" ? (
          <span className="status-pill status-pill--done" role="img" aria-label="Пропуск">
            <IconSkip size={16} className="status-pill__icon" />
            Пропуск
          </span>
        ) : (
          <span className="status-pill status-pill--done" role="img" aria-label="Сделано">
            <IconCheck size={16} className="status-pill__icon" />
            Сделано
          </span>
        )}
      </div>
    </div>
  );
}

function slotRu(s: TimeSlot): string {
  switch (s) {
    case "morning":
      return "утро";
    case "day":
      return "день";
    case "evening":
      return "вечер";
    case "night":
      return "почти ночь";
    default:
      return "любое";
  }
}
