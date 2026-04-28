import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { MEMBERS } from "../constants";
import { useI18n } from "../i18n/I18nProvider";
import { IconCheck, IconPencil, IconPlus, IconTrash, IconListChecks, IconClose } from "./Icons";
import { getEffectiveTaskStatus } from "../logic/taskDay";
import type { MemberId, Task, TimeSlot } from "../types";

function slotShort(tFn: (path: string) => string, slot: TimeSlot): string {
  return tFn(`slots.slotHintShort.${slot}`);
}

type UpdatePayload = {
  title: string;
  assignee: MemberId;
  slot: TimeSlot;
  notes: string;
  daily: boolean;
  status: Task["status"];
};

function taskToEditForm(task: Task): UpdatePayload {
  return {
    title: task.title,
    assignee: task.assignee,
    slot: task.slot,
    notes: task.notes ?? "",
    daily: task.recurrence === "daily",
    status: task.status,
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
  const { t, locale } = useI18n();
  const titleId = useId();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UpdatePayload | null>(null);

  const slotOptions = useMemo(
    () =>
      (["morning", "day", "evening", "night", "any"] as const).map((value) => ({
        value,
        label: t(`slots.${value}`),
      })),
    [t],
  );

  const sorted = useMemo(() => {
    const order = new Map(MEMBERS.map((m, i) => [m.id, i]));
    const collator = locale === "ru" ? "ru" : "en";
    return [...tasks].sort((a, b) => {
      const oa = order.get(a.assignee) ?? 99;
      const ob = order.get(b.assignee) ?? 99;
      if (oa !== ob) return oa - ob;
      return a.title.localeCompare(b.title, collator);
    });
  }, [tasks, locale]);

  const startEdit = useCallback((task: Task) => {
    setEditingId(task.id);
    setForm(taskToEditForm(task));
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
    (task: Task) => {
      if (window.confirm(t("tasksManage.deleteConfirm", { title: task.title }))) {
        onDelete(task.id);
        if (editingId === task.id) cancelEdit();
      }
    },
    [onDelete, editingId, cancelEdit, t],
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
            {t("tasksManage.title")}
          </h2>
          <button type="button" className="task-manage-close" onClick={onClose} aria-label={t("tasksManage.closeAria")}>
            <IconClose size={20} />
          </button>
        </div>
        <p className="section-hint" style={{ marginTop: 0 }}>
          {t("tasksManage.hint")}
        </p>

        {sorted.length === 0 ? (
          <p className="empty">{t("tasksManage.empty")}</p>
        ) : (
          <ul className="task-manage-list">
            {sorted.map((taskItem) => {
              const eff = getEffectiveTaskStatus(taskItem, dayKey);
              const m = MEMBERS.find((x) => x.id === taskItem.assignee);
              const isEdit = editingId === taskItem.id && form;

              return (
                <li key={taskItem.id} className="task-manage-item">
                  {isEdit && form ? (
                    <div className="task-manage-form">
                      <input
                        className="task-manage-input"
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        aria-label={t("tasksManage.titleLabelAria")}
                      />
                      <div className="task-manage-form-row">
                        <label className="task-manage-label">
                          {t("tasksManage.assigneeLabel")}
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
                          {t("tasksManage.slotLabel")}
                          <select value={form.slot} onChange={(e) => setForm({ ...form, slot: e.target.value as TimeSlot })}>
                            {slotOptions.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label className="task-manage-label">
                        {t("tasksManage.notesLabel")}
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
                          {t("tasksManage.dailyCheckbox")}
                        </label>
                        {taskItem.shoppingItemId == null && taskItem.petId == null ? (
                          <label className="task-manage-label task-manage-status">
                            {t("tasksManage.statusLabel")}
                            <select
                              value={form.status}
                              onChange={(e) => setForm({ ...form, status: e.target.value as Task["status"] })}
                            >
                              <option value="planned">{t("tasksManage.statusPlanned")}</option>
                              <option value="done">{t("tasksManage.statusDone")}</option>
                              <option value="skipped">{t("tasksManage.statusSkipped")}</option>
                              <option value="deferred">{t("tasksManage.statusDeferred")}</option>
                            </select>
                          </label>
                        ) : null}
                      </div>
                      <div className="task-manage-form-actions">
                        <button type="button" className="btn btn-primary" onClick={() => saveEdit(taskItem.id)}>
                          <IconCheck size={16} />
                          {t("tasksManage.save")}
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={cancelEdit}>
                          {t("tasksManage.cancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="task-manage-row">
                      <div className="task-manage-main">
                        <div className="task-manage-name">{taskItem.title}</div>
                        <div className="task-manage-meta">
                          <span style={{ color: m?.color, fontWeight: 700 }}>{m?.shortName}</span>
                          <span>· {slotShort(t, taskItem.slot)}</span>
                          {taskItem.recurrence === "daily" ? (
                            <span className="badge badge-daily">{t("tasksManage.dailyBadge")}</span>
                          ) : null}
                          <span
                            className={eff === "done" ? "task-manage-eff task-manage-eff--done" : "task-manage-eff"}
                            title={t("tasksManage.metaEffTitle")}
                          >
                            {eff === "done"
                              ? taskItem.recurrence === "daily"
                                ? t("tasksManage.metaEffDoneDaily")
                                : t("tasksManage.metaEffDone")
                              : t("tasksManage.metaEffPlanned")}
                          </span>
                        </div>
                        {taskItem.notes ? <p className="row-note task-manage-prew">{taskItem.notes}</p> : null}
                      </div>
                      <div className="task-manage-toolbar">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          title={t("tasksManage.editTitle")}
                          aria-label={t("tasksManage.editAria")}
                          onClick={() => startEdit(taskItem)}
                        >
                          <IconPencil size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-warn"
                          title={t("tasksManage.deleteTitle")}
                          aria-label={t("tasksManage.deleteAria")}
                          onClick={() => tryDelete(taskItem)}
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
          <IconPlus size={14} /> {t("tasksManage.hintFooter")}
        </p>
        <div className="task-manage-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t("tasksManage.doneButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
