import { useCallback, useEffect, useState } from "react";
import { MEMBERS } from "./constants";
import { IconCart, IconCheck, IconClock, IconPaw, IconPlus, IconSkip, IconUsers } from "./components/Icons";
import { usePersistedApp } from "./hooks/usePersistedApp";
import { aggregateForAll, petTaskRelevantNow, taskRelevantNow } from "./logic/relevance";
import { buildVirtualPetTasks, formatPlanTime } from "./logic/pets";
import { getDayPhase, phaseLabel, phaseTimeRange } from "./logic/time";
import type { MemberId, ShoppingItem, TabId, Task, TimeSlot, VirtualPetTask } from "./types";

function dateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

type Row =
  | { kind: "task"; task: Task }
  | { kind: "pet"; pet: VirtualPetTask }
  | { kind: "shop"; item: ShoppingItem };

function useNowTicker(intervalMs: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export default function App() {
  const { ready, state, setTaskStatus, markShoppingBought, addShopping, addTask, setPetCompletion, resetDemo } =
    usePersistedApp();
  const now = useNowTicker(60_000);
  const [tab, setTab] = useState<TabId>("all");
  const [toast, setToast] = useState<string | null>(null);
  const [shopDraft, setShopDraft] = useState("");
  const [shopAssignee, setShopAssignee] = useState<MemberId>("anya");
  const [personShopDraft, setPersonShopDraft] = useState("");
  const [personShopAssignee, setPersonShopAssignee] = useState<MemberId>("anya");
  const [taskDraft, setTaskDraft] = useState("");
  const [taskSlot, setTaskSlot] = useState<TimeSlot>("any");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (tab !== "all") setPersonShopAssignee(tab);
  }, [tab]);

  if (!ready || !state) {
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

  const rowsForMember = (member: MemberId): { now: Row[]; later: Row[] } => {
    const tasks = state.tasks.filter((t) => t.assignee === member);
    const pets = virtualPets.filter((v) => v.assignee === member);
    const shops = state.shopping.filter((s) => s.assignee === member && s.status === "open");

    const nowRows: Row[] = [];
    const laterRows: Row[] = [];

    for (const t of tasks) {
      const row: Row = { kind: "task", task: t };
      if (t.status === "planned" && taskRelevantNow(t, phase)) nowRows.push(row);
      else if (t.status === "planned") laterRows.push(row);
    }
    for (const v of pets) {
      const row: Row = { kind: "pet", pet: v };
      if (v.status === "planned" && petTaskRelevantNow(v, phase, nowMin)) nowRows.push(row);
      else if (v.status === "planned") laterRows.push(row);
    }
    for (const item of shops) {
      nowRows.push({ kind: "shop", item });
    }

    const score = (r: Row): number => {
      if (r.kind === "pet" && r.pet.kind === "feed" && r.pet.inFeedWindow) return 0;
      if (r.kind === "pet" && r.pet.kind === "feed") return 1;
      if (r.kind === "shop") return 2;
      if (r.kind === "task") return 3;
      return 4;
    };
    nowRows.sort((a, b) => score(a) - score(b));

    return { now: nowRows, later: laterRows };
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
    addTask(taskDraft, member, taskSlot);
    setTaskDraft("");
    showToast("Задача добавлена.");
  };

  const agg = aggregateForAll(state.tasks, virtualPets, state.shopping, now);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <img src="/images/logo-mark.svg" alt="" width={48} height={48} />
          <div>
            <h1>Дом и задачи</h1>
            <p>Семья · питомцы · покупки</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <a className="resume-link" href="/resume/index.html" title="Открыть резюме">
            Резюме
          </a>
          <img className="hero-art" src="/images/house.svg" alt="" />
          <div className="phase-pill" title={phaseTimeRange(phase)}>
            <IconClock size={16} />
            {phaseLabel(phase)}
          </div>
        </div>
      </header>

      <nav className="tabs" role="tablist" aria-label="Члены семьи">
        <button type="button" className="tab tab-all" role="tab" aria-selected={tab === "all"} onClick={() => setTab("all")}>
          <IconUsers size={16} style={{ marginRight: 6, verticalAlign: "text-bottom" }} />
          Все
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
              <IconUsers size={18} /> Сегодня по дому
            </h2>
            <p className="section-hint">
              Сейчас по времени: <strong>{phaseLabel(phase)}</strong> — актуальные поручения и питомцы у каждого.
            </p>
            <div className="grid-overview">
              {agg.map((a) => {
                const m = MEMBERS.find((x) => x.id === a.member)!;
                return (
                  <button
                    key={a.member}
                    type="button"
                    className="member-tile"
                    onClick={() => setTab(a.member)}
                    style={{ borderLeft: `4px solid ${m.color}` }}
                  >
                    <h3>{m.shortName}</h3>
                    <div className="role">
                      {m.role} · {m.fullName}
                    </div>
                    <div className="stat">
                      Актуально сейчас: <strong>{a.relevant}</strong> · Всего открыто: <strong>{a.planned}</strong>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card">
            <h2>
              <IconCart size={18} /> Общий список покупок
            </h2>
            <p className="section-hint">Один источник правды: назначили маме — у Ани в задачах и здесь.</p>
            {state.shopping.length === 0 ? (
              <div className="empty">Пока пусто — добавьте ниже.</div>
            ) : (
              state.shopping.map((item) => {
                const assignee = MEMBERS.find((x) => x.id === item.assignee);
                return (
                  <div key={item.id} className="row">
                    <div>
                      <div className="row-title">{item.title}</div>
                      <div className="row-meta">
                        {item.status === "bought" ? "Куплено" : `Купит: ${assignee?.shortName ?? ""}`}
                      </div>
                    </div>
                    <div className="row-actions">
                      {item.status === "open" ? (
                        <button type="button" className="btn btn-primary" onClick={() => onBought(item)}>
                          <IconCheck size={16} /> Куплено
                        </button>
                      ) : (
                        <span className="badge">Готово</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
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
                      В задачи: {m.shortName}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn btn-primary">
                  <IconPlus size={16} /> Добавить
                </button>
              </div>
            </form>
          </div>
        </section>
      ) : (
        <PersonSection
          member={tab}
          phase={phase}
          rowsForMember={rowsForMember(tab)}
          onDoneTask={onDoneTask}
          onDonePet={onDonePet}
          onSkipPetWalk={onSkipPetWalk}
          onBought={onBought}
          taskDraft={taskDraft}
          setTaskDraft={setTaskDraft}
          taskSlot={taskSlot}
          setTaskSlot={setTaskSlot}
          onSubmitTask={(e) => submitTask(e, tab)}
          personShopDraft={personShopDraft}
          setPersonShopDraft={setPersonShopDraft}
          personShopAssignee={personShopAssignee}
          setPersonShopAssignee={setPersonShopAssignee}
          onSubmitPersonShop={(e) => {
            e.preventDefault();
            if (!personShopDraft.trim()) return;
            addShopping(personShopDraft, personShopAssignee);
            setPersonShopDraft("");
            showToast("В общий список — у получателя в «Сейчас».");
          }}
        />
      )}

      <div className="footer-actions">
        <button type="button" className="linkish" onClick={resetDemo}>
          Сбросить демо-данные
        </button>
        <span className="badge" title="Прототип: данные в браузере">
          Локально · {now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </div>
  );
}

function PersonSection({
  member,
  phase,
  rowsForMember,
  onDoneTask,
  onDonePet,
  onSkipPetWalk,
  onBought,
  taskDraft,
  setTaskDraft,
  taskSlot,
  setTaskSlot,
  onSubmitTask,
  personShopDraft,
  setPersonShopDraft,
  personShopAssignee,
  setPersonShopAssignee,
  onSubmitPersonShop,
}: {
  member: MemberId;
  phase: ReturnType<typeof getDayPhase>;
  rowsForMember: { now: Row[]; later: Row[] };
  personShopDraft: string;
  setPersonShopDraft: (s: string) => void;
  personShopAssignee: MemberId;
  setPersonShopAssignee: (m: MemberId) => void;
  onSubmitPersonShop: (e: React.FormEvent) => void;
  onDoneTask: (t: Task) => void;
  onDonePet: (p: VirtualPetTask) => void;
  onSkipPetWalk: (p: VirtualPetTask) => void;
  onBought: (s: ShoppingItem) => void;
  taskDraft: string;
  setTaskDraft: (s: string) => void;
  taskSlot: TimeSlot;
  setTaskSlot: (s: TimeSlot) => void;
  onSubmitTask: (e: React.FormEvent) => void;
}) {
  const m = MEMBERS.find((x) => x.id === member)!;
  const { now, later } = rowsForMember;

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
        <p className="section-hint">
          Корм показывается строже (±1 ч к плану), прогулки — мягче. Покупки всегда под рукой.
        </p>
        {now.length === 0 ? (
          <div className="empty">Сейчас тихо — загляните в «Дальше по списку» или добавьте задачу.</div>
        ) : (
          now.map((r) => (
            <RowView
              key={
                r.kind === "task"
                  ? r.task.id
                  : r.kind === "pet"
                    ? r.pet.id
                    : `shop-${r.item.id}`
              }
              row={r}
              onDoneTask={onDoneTask}
              onDonePet={onDonePet}
              onSkipPetWalk={onSkipPetWalk}
              onBought={onBought}
            />
          ))
        )}
      </div>

      <div className="card">
        <h2>Дальше по списку</h2>
        <p className="section-hint">Запланировано не на этот отрезок дня.</p>
        {later.length === 0 ? (
          <div className="empty">Нет отложенных задач и ухода — отличный день.</div>
        ) : (
          later.map((r) => (
            <RowView
              key={
                r.kind === "task"
                  ? r.task.id
                  : r.kind === "pet"
                    ? r.pet.id
                    : `shop-${r.item.id}`
              }
              row={r}
              onDoneTask={onDoneTask}
              onDonePet={onDonePet}
              onSkipPetWalk={onSkipPetWalk}
              onBought={onBought}
            />
          ))
        )}
      </div>

      <div className="card">
        <h2>
          <IconCart size={18} /> В общий список покупок
        </h2>
        <p className="section-hint">Тот же список, что на вкладке «Все». Кому купить — тому же попадёт в «Сейчас».</p>
        <form className="forms" onSubmit={onSubmitPersonShop}>
          <div className="input-row">
            <input
              value={personShopDraft}
              onChange={(e) => setPersonShopDraft(e.target.value)}
              placeholder="Что купить?"
              aria-label="Пункт покупок"
            />
            <select
              value={personShopAssignee}
              onChange={(e) => setPersonShopAssignee(e.target.value as MemberId)}
              aria-label="Кому в задачи"
            >
              {MEMBERS.map((x) => (
                <option key={x.id} value={x.id}>
                  Купит: {x.shortName}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary">
              <IconPlus size={16} /> Добавить
            </button>
          </div>
        </form>
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
              <option value="night">Ночь</option>
              <option value="any">В любое время</option>
            </select>
            <button type="submit" className="btn btn-primary">
              Добавить себе
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function RowView({
  row,
  onDoneTask,
  onDonePet,
  onSkipPetWalk,
  onBought,
}: {
  row: Row;
  onDoneTask: (t: Task) => void;
  onDonePet: (p: VirtualPetTask) => void;
  onSkipPetWalk: (p: VirtualPetTask) => void;
  onBought: (s: ShoppingItem) => void;
}) {
  if (row.kind === "shop") {
    const { item } = row;
    return (
      <div className="row">
        <div>
          <div className="row-title">
            <IconCart size={16} style={{ marginRight: 6, verticalAlign: "text-bottom", color: "#a24a63" }} />
            {item.title}
          </div>
          <div className="row-meta">Покупка · в общем списке</div>
        </div>
        <div className="row-actions">
          <button type="button" className="btn btn-primary" onClick={() => onBought(item)}>
            <IconCheck size={16} /> Куплено
          </button>
        </div>
      </div>
    );
  }

  if (row.kind === "task") {
    const { task } = row;
    return (
      <div className="row">
        <div>
          <div className="row-title">{task.title}</div>
          <div className="row-meta">Задача · слот: {slotRu(task.slot)}</div>
        </div>
        <div className="row-actions">
          <button type="button" className="btn btn-primary" onClick={() => onDoneTask(task)} disabled={task.status !== "planned"}>
            <IconCheck size={16} /> Готово
          </button>
        </div>
      </div>
    );
  }

  const { pet } = row;
  const isWalk = pet.kind === "walk";
  return (
    <div className="row">
      <div>
        <div className="row-title">
          <IconPaw size={16} style={{ marginRight: 6, verticalAlign: "text-bottom", color: "#6b5344" }} />
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
        <button type="button" className="btn btn-primary" onClick={() => onDonePet(pet)}>
          <IconCheck size={16} /> Сделано
        </button>
        {isWalk ? (
          <button type="button" className="btn btn-warn" onClick={() => onSkipPetWalk(pet)} title="Пропустить без стресса">
            <IconSkip size={16} /> Пропуск
          </button>
        ) : null}
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
      return "ночь";
    default:
      return "любое";
  }
}
