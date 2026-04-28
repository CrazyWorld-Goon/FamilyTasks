import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { MEMBERS } from "../constants";
import { IconCheck, IconPencil, IconPlus, IconTrash, IconListChecks, IconClose } from "./Icons";
import { getEffectiveTaskStatus } from "../logic/taskDay";
import type { MemberId, Task, TimeSlot } from "../types";

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

type UpdatePayload = {
  title: string;
  assignee: MemberId;
  slot: TimeSlot;
  notes: string;
  daily: boolean;
  status: Task["status"];
};

const slots: { value: TimeSlot; label: string }[] = [
  { value: "morning", label: "Утро" },
  { value: "day", label: "День" },
  { value: "evening", label: "Вечер" },
  { value: "night", label: "Почти ночь" },
  { value: "any", label: "В любое время" },
];

function taskToEditForm(t: Task): UpdatePayload {
  return {
    title: t.title,
    assignee: t.assignee,
    slot: t.slot,
    notes: t.notes ?? "",
    daily: t.recurrence === "daily",
    status: t.status,
  };
}

export function TasksManageDialog({
  open,
  onClose,
  tasks,
  dayKey,
  onUpdate,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  tasks: Task[];
  dayKey: string;
  onUpdate: (id: string, data: UpdatePayload) => void;
  onDelete: (id: string) => void;
}) {
  const titleId = useId();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UpdatePayload | null>(null);

  const sorted = useMemo(() => {
    const order = new Map(MEMBERS.map((m, i) => [m.id, i]));
    return [...tasks].sort((a, b) => {
      const oa = order.get(a.assignee) ?? 99;
      const ob = order.get(b.assignee) ?? 99;
      if (oa !== ob) return oa - ob;
      return a.title.localeCompare(b.title, "ru");
    });
  }, [tasks]);

  const startEdit = useCallback((t: Task) => {
    setEditingId(t.id);
    setForm(taskToEditForm(t));
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setForm(null);
  }, []);

  const saveEdit = useCallback(
    (id: string) => {
      if (!form) return;
      if (!form.title.trim()) return;
      onUpdate(id, form);
      setEditingId(null);
      setForm(null);
    },
    [form, onUpdate],
  );

  const tryDelete = useCallback(
    (t: Task) => {
      if (window.confirm(`Удалить задачу «${t.title}»? Это нельзя отменить.`)) {
        onDelete(t.id);
        if (editingId === t.id) cancelEdit();
      }
    },
    [onDelete, editingId, cancelEdit],
  );

  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setForm(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editingId) {
        setEditingId(null);
        setForm(null);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, editingId]);

  if (!open) return null;

  return (
    <div className="task-manage-backdrop" role="presentation" onClick={onClose}>
      <div
        className="task-manage-panel card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="task-manage-header">
          <h2 id={titleId} className="task-manage-title">
            <IconListChecks size={20} className="task-manage-title-icon" />
            Задачи семьи
          </h2>
          <button type="button" className="task-manage-close" onClick={onClose} aria-label="Закрыть">
            <IconClose size={20} />
          </button>
        </div>
        <p className="section-hint" style={{ marginTop: 0 }}>
          Редактирование и удаление — без «списка покупок» и питомцев, только ваши поручения.
        </p>

        {sorted.length === 0 ? (
          <p className="empty">Пока нет задач — добавьте в разделе члена семьи.</p>
        ) : (
          <ul className="task-manage-list">
            {sorted.map((t) => {
              const eff = getEffectiveTaskStatus(t, dayKey);
              const m = MEMBERS.find((x) => x.id === t.assignee);
              const isEdit = editingId === t.id && form;

              return (
                <li key={t.id} className="task-manage-item">
                  {isEdit && form ? (
                    <div className="task-manage-form">
                      <input
                        className="task-manage-input"
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        aria-label="Название"
                      />
                      <div className="task-manage-form-row">
                        <label className="task-manage-label">
                          Кому
                          <select
                            value={form.assignee}
                            onChange={(e) => setForm({ ...form, assignee: e.target.value as MemberId })}
                          >
                            {MEMBERS.map((mem) => (
                              <option key={mem.id} value={mem.id}>
                                {mem.shortName}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="task-manage-label">
                          Слот
                          <select value={form.slot} onChange={(e) => setForm({ ...form, slot: e.target.value as TimeSlot })}>
                            {slots.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label className="task-manage-label">
                        Доп. сведения
                        <textarea
                          value={form.notes}
                          onChange={(e) => setForm({ ...form, notes: e.target.value })}
                          rows={2}
                        />
                      </label>
                      <div className="task-manage-form-row task-manage-form-row--tight">
                        <label className="checkbox-line task-manage-inline-check">
                          <input
                            type="checkbox"
                            checked={form.daily}
                            onChange={(e) => setForm({ ...form, daily: e.target.checked })}
                          />
                          Каждый день
                        </label>
                        {t.shoppingItemId == null && t.petId == null ? (
                          <label className="task-manage-label task-manage-status">
                            Статус
                            <select
                              value={form.status}
                              onChange={(e) => setForm({ ...form, status: e.target.value as Task["status"] })}
                            >
                              <option value="planned">В плане</option>
                              <option value="done">Сделано</option>
                              <option value="skipped">Пропущено</option>
                              <option value="deferred">Перенесено</option>
                            </select>
                          </label>
                        ) : null}
                      </div>
                      <div className="task-manage-form-actions">
                        <button type="button" className="btn btn-primary" onClick={() => saveEdit(t.id)}>
                          <IconCheck size={16} />
                          Сохранить
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={cancelEdit}>
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="task-manage-row">
                      <div className="task-manage-main">
                        <div className="task-manage-name">{t.title}</div>
                        <div className="task-manage-meta">
                          <span style={{ color: m?.color, fontWeight: 700 }}>{m?.shortName}</span>
                          <span>· {slotRu(t.slot)}</span>
                          {t.recurrence === "daily" ? (
                            <span className="badge badge-daily">каждый день</span>
                          ) : null}
                          <span
                            className={eff === "done" ? "task-manage-eff task-manage-eff--done" : "task-manage-eff"}
                            title="С учётом «на сегодня»"
                          >
                            {eff === "done" ? (t.recurrence === "daily" ? "сегодня сделано" : "сделано") : "к делу"}
                          </span>
                        </div>
                        {t.notes ? <p className="row-note task-manage-prew">{t.notes}</p> : null}
                      </div>
                      <div className="task-manage-toolbar">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          title="Редактировать"
                          aria-label="Редактировать"
                          onClick={() => startEdit(t)}
                        >
                          <IconPencil size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-warn"
                          title="Удалить"
                          aria-label="Удалить"
                          onClick={() => tryDelete(t)}
                        >
                          <IconTrash size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="task-manage-hint">
          <IconPlus size={14} /> Чтобы <strong>создать</strong> новую задачу, оставьте панель и откройте вкладку
          семьи — блок «Быстрая задача».
        </p>
        <div className="task-manage-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
