import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { MEMBERS } from "../constants";
import { useI18n } from "../i18n/I18nProvider";
import { IconCheck, IconPencil, IconPlus, IconTrash, IconListChecks, IconClose } from "./Icons";
import { getEffectiveTaskStatus } from "../logic/taskDay";
import type { MemberId, Task, TimeSlot } from "../types";

function slotShort(tFn: (path: string) => string, slot: TimeSlot): string {
  return tFn(`slots.slotHintShort.${slot}`);
}

const EXACT_TIME_OPTION = "__exact_time__";
type ScheduleSelectValue = TimeSlot | typeof EXACT_TIME_OPTION;

type UpdatePayload = {
  title: string;
  assignee: MemberId;
  assignees?: MemberId[];
  slot: TimeSlot;
  plannedTime?: string;
  scheduleMode: "slot" | "time";
  notes: string;
  daily: boolean;
  status: Task["status"];
};

type PermanentPayload = {
  title: string;
  assignees: MemberId[];
  slot: TimeSlot;
  plannedTime?: string;
  active: boolean;
  scheduleMode: "slot" | "time";
};

function normalizeHHMM(raw: string): string | null {
  const value = raw.trim();
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const parts = value.split(":");
  if (parts.length !== 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (Number.isNaN(h) || Number.isNaN(m) || h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function taskToEditForm(task: Task): UpdatePayload {
  return {
    title: task.title,
    assignee: task.assignee,
    slot: task.slot,
    plannedTime: task.plannedTime,
    scheduleMode: task.plannedTime ? "time" : "slot",
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
  onCreatePermanent,
  onUpdatePermanent,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  tasks: Task[];
  dayKey: string;
  onUpdate: (id: string, data: UpdatePayload) => void;
  onCreatePermanent: (data: PermanentPayload) => void;
  onUpdatePermanent: (id: string, data: PermanentPayload) => void;
  onDelete: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const titleId = useId();
  const fallbackMember: MemberId = MEMBERS[0]?.id ?? "anya";
  const [mode, setMode] = useState<"regular" | "permanent">("regular");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UpdatePayload | null>(null);
  const [permanentForm, setPermanentForm] = useState<PermanentPayload>({
    title: "",
    assignees: [fallbackMember],
    slot: "any",
    plannedTime: undefined,
    active: true,
    scheduleMode: "slot",
  });
  const [editingPermanentId, setEditingPermanentId] = useState<string | null>(null);
  const [editingPermanent, setEditingPermanent] = useState<PermanentPayload | null>(null);
  const [permanentSubmitAttempted, setPermanentSubmitAttempted] = useState(false);
  const permanentTitleRef = useRef<HTMLInputElement | null>(null);

  const slotOptions = useMemo(
    () =>
      (["morning", "day", "evening", "night", "any"] as const).map((value) => ({
        value,
        label: t(`slots.${value}`),
      })),
    [t],
  );
  const scheduleOptions = useMemo(
    () => [
      ...slotOptions,
      { value: EXACT_TIME_OPTION, label: t("tasksManage.slotExactTimeOption") },
    ],
    [slotOptions, t],
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
  const regularTasks = useMemo(() => sorted.filter((tItem) => tItem.recurrence !== "daily"), [sorted]);
  const permanentTasks = useMemo(() => sorted.filter((tItem) => tItem.recurrence === "daily"), [sorted]);

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
      const normalizedTime = form.plannedTime ? normalizeHHMM(form.plannedTime) : null;
      if (form.scheduleMode === "time" && !normalizedTime) return;
      onUpdate(id, {
        ...form,
        slot: form.scheduleMode === "slot" ? form.slot : "any",
        plannedTime: form.scheduleMode === "time" ? normalizedTime ?? undefined : undefined,
      });
      setEditingId(null);
      setForm(null);
    },
    [form, onUpdate],
  );

  const togglePermanentAssignee = useCallback((memberId: MemberId, target: "new" | "edit") => {
    if (target === "new") {
      setPermanentForm((prev) => {
        const exists = prev.assignees.includes(memberId);
        const next = exists ? prev.assignees.filter((id) => id !== memberId) : [...prev.assignees, memberId];
        return { ...prev, assignees: next };
      });
      return;
    }
    setEditingPermanent((prev) => {
      if (!prev) return prev;
      const exists = prev.assignees.includes(memberId);
      const next = exists ? prev.assignees.filter((id) => id !== memberId) : [...prev.assignees, memberId];
      return { ...prev, assignees: next.length > 0 ? next : prev.assignees };
    });
  }, []);

  const submitPermanent = useCallback(() => {
    setPermanentSubmitAttempted(true);
    const title = permanentForm.title.trim();
    if (!title || permanentForm.assignees.length === 0) return;
    const normalizedTime = permanentForm.plannedTime ? normalizeHHMM(permanentForm.plannedTime) : null;
    if (permanentForm.scheduleMode === "time" && !normalizedTime) return;
    onCreatePermanent({
      ...permanentForm,
      title,
      slot: permanentForm.scheduleMode === "slot" ? permanentForm.slot : "any",
      plannedTime: permanentForm.scheduleMode === "time" ? normalizedTime ?? undefined : undefined,
    });
    setPermanentForm({
      title: "",
      assignees: [fallbackMember],
      slot: "any",
      plannedTime: undefined,
      active: true,
      scheduleMode: "slot",
    });
    setPermanentSubmitAttempted(false);
  }, [fallbackMember, onCreatePermanent, permanentForm]);

  const startEditPermanent = useCallback((task: Task) => {
    const assignees = task.assignees?.length ? task.assignees : [task.assignee];
    setEditingPermanentId(task.id);
    setEditingPermanent({
      title: task.title,
      slot: task.slot,
      assignees,
      plannedTime: task.plannedTime,
      active: task.active !== false,
      scheduleMode: task.plannedTime ? "time" : "slot",
    });
  }, []);

  const savePermanentEdit = useCallback(() => {
    if (!editingPermanentId || !editingPermanent) return;
    const title = editingPermanent.title.trim();
    if (!title || editingPermanent.assignees.length === 0) return;
    const normalizedTime = editingPermanent.plannedTime ? normalizeHHMM(editingPermanent.plannedTime) : null;
    if (editingPermanent.scheduleMode === "time" && !normalizedTime) return;
    onUpdatePermanent(editingPermanentId, {
      ...editingPermanent,
      title,
      slot: editingPermanent.scheduleMode === "slot" ? editingPermanent.slot : "any",
      plannedTime: editingPermanent.scheduleMode === "time" ? normalizedTime ?? undefined : undefined,
    });
    setEditingPermanentId(null);
    setEditingPermanent(null);
  }, [editingPermanent, editingPermanentId, onUpdatePermanent]);

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
      setMode("regular");
      setEditingId(null);
      setForm(null);
      setEditingPermanentId(null);
      setEditingPermanent(null);
      setPermanentSubmitAttempted(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || mode !== "permanent") return;
    permanentTitleRef.current?.focus();
  }, [mode, open]);

  const normalizedPermanentTime = useMemo(
    () => (permanentForm.plannedTime ? normalizeHHMM(permanentForm.plannedTime) : null),
    [permanentForm.plannedTime],
  );
  const permanentTitleError = useMemo(
    () => (permanentForm.title.trim() ? null : t("tasksManage.validationTitleRequired")),
    [permanentForm.title, t],
  );
  const permanentAssigneesError = useMemo(
    () => (permanentForm.assignees.length > 0 ? null : t("tasksManage.validationAssigneeRequired")),
    [permanentForm.assignees.length, t],
  );
  const permanentTimeError = useMemo(() => {
    if (permanentForm.scheduleMode !== "time") return null;
    if (!permanentForm.plannedTime) return t("tasksManage.validationTimeRequired");
    return normalizedPermanentTime ? null : t("tasksManage.validationTimeInvalid");
  }, [normalizedPermanentTime, permanentForm.plannedTime, permanentForm.scheduleMode, t]);
  const isPermanentFormValid = !permanentTitleError && !permanentAssigneesError && !permanentTimeError;
  const permanentAssigneesText = useMemo(() => {
    const names = permanentForm.assignees
      .map((id) => MEMBERS.find((m) => m.id === id)?.shortName ?? id)
      .join(", ");
    return names || t("tasksManage.assigneesNoneSelected");
  }, [permanentForm.assignees, t]);
  const permanentWhenText = permanentForm.scheduleMode === "time"
    ? normalizedPermanentTime ?? (permanentForm.plannedTime || "--:--")
    : slotShort(t, permanentForm.slot);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editingId) {
        setEditingId(null);
        setForm(null);
        return;
      }
      if (editingPermanentId) {
        setEditingPermanentId(null);
        setEditingPermanent(null);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, editingId, editingPermanentId]);

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
        <div className="task-manage-mode-switch">
          <button
            type="button"
            className="btn btn-ghost"
            aria-pressed={mode === "regular"}
            onClick={() => setMode("regular")}
          >
            {t("tasksManage.modeRegular")}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            aria-pressed={mode === "permanent"}
            onClick={() => setMode("permanent")}
          >
            {t("tasksManage.modePermanent")}
          </button>
        </div>

        {mode === "regular" ? (
          regularTasks.length === 0 ? (
            <p className="empty">{t("tasksManage.empty")}</p>
          ) : (
            <ul className="task-manage-list">
              {regularTasks.map((taskItem) => {
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
                            {t("tasksManage.slotLabel")}
                            <select
                              value={form.scheduleMode === "time" ? EXACT_TIME_OPTION : form.slot}
                              onChange={(e) => {
                                const selected = e.target.value as ScheduleSelectValue;
                                if (selected === EXACT_TIME_OPTION) {
                                  setForm({ ...form, scheduleMode: "time" });
                                  return;
                                }
                                setForm({
                                  ...form,
                                  scheduleMode: "slot",
                                  slot: selected,
                                  plannedTime: undefined,
                                });
                              }}
                            >
                              {scheduleOptions.map((s) => (
                                <option key={s.value} value={s.value}>
                                  {s.label}
                                </option>
                              ))}
                            </select>
                          </label>
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
                          {form.scheduleMode === "time" ? (
                            <label className="task-manage-label">
                              {t("tasksManage.exactTimeLabel")}
                              <input
                                className="task-manage-input"
                                type="time"
                                value={form.plannedTime ?? ""}
                                onChange={(e) => setForm({ ...form, plannedTime: e.target.value || undefined })}
                              />
                            </label>
                          ) : null}
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
                            <span>· {taskItem.plannedTime ?? slotShort(t, taskItem.slot)}</span>
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
          )
        ) : (
          <div className="task-manage-permanent">
            <div className="task-manage-form task-manage-form--permanent">
              <input
                ref={permanentTitleRef}
                className="task-manage-input"
                value={permanentForm.title}
                onChange={(e) => setPermanentForm((prev) => ({ ...prev, title: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  submitPermanent();
                }}
                placeholder={t("tasksManage.permanentTitlePlaceholder")}
                aria-label={t("tasksManage.permanentTitleAria")}
              />
              {permanentSubmitAttempted && permanentTitleError ? (
                <p className="task-manage-error">{permanentTitleError}</p>
              ) : null}
              <label className="task-manage-label task-manage-label--compact">
                {t("tasksManage.slotLabel")}
                <select
                  value={permanentForm.scheduleMode === "time" ? EXACT_TIME_OPTION : permanentForm.slot}
                  onChange={(e) => {
                    const selected = e.target.value as ScheduleSelectValue;
                    if (selected === EXACT_TIME_OPTION) {
                      setPermanentForm((prev) => ({ ...prev, scheduleMode: "time" }));
                      return;
                    }
                    setPermanentForm((prev) => ({
                      ...prev,
                      scheduleMode: "slot",
                      slot: selected,
                      plannedTime: undefined,
                    }));
                  }}
                >
                  {scheduleOptions.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              {permanentForm.scheduleMode === "time" ? (
                <label className="task-manage-label task-manage-label--compact">
                  {t("tasksManage.exactTimeLabel")}
                  <input
                    className="task-manage-input"
                    type="time"
                    value={permanentForm.plannedTime ?? ""}
                    onChange={(e) =>
                      setPermanentForm((prev) => ({ ...prev, plannedTime: e.target.value ? e.target.value : undefined }))
                    }
                  />
                </label>
              ) : null}
              {permanentSubmitAttempted && permanentTimeError ? <p className="task-manage-error">{permanentTimeError}</p> : null}
              <label className="checkbox-line task-manage-inline-check">
                <input
                  type="checkbox"
                  checked={permanentForm.active}
                  onChange={(e) => setPermanentForm((prev) => ({ ...prev, active: e.target.checked }))}
                />
                {t("tasksManage.activeLabel")}
              </label>
              <div className="task-manage-assignees">
                <span className="task-manage-label-text">{t("tasksManage.assigneesLabel")}</span>
                <div className="task-manage-form-actions task-manage-form-actions--compact">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setPermanentForm((prev) => ({ ...prev, assignees: MEMBERS.map((m) => m.id) }))}
                  >
                    {t("tasksManage.assigneesSelectAll")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setPermanentForm((prev) => ({ ...prev, assignees: [] }))}
                  >
                    {t("tasksManage.assigneesClear")}
                  </button>
                </div>
                <div className="task-manage-assignees-grid">
                  {MEMBERS.map((mem) => (
                    <label key={mem.id} className="checkbox-line task-manage-inline-check">
                      <input
                        type="checkbox"
                        checked={permanentForm.assignees.includes(mem.id)}
                        onChange={() => togglePermanentAssignee(mem.id, "new")}
                      />
                      {mem.shortName}
                    </label>
                  ))}
                </div>
                <p className="task-manage-assignees-summary">
                  {t("tasksManage.assigneesSummary", { names: permanentAssigneesText })}
                </p>
              </div>
              {permanentSubmitAttempted && permanentAssigneesError ? (
                <p className="task-manage-error">{permanentAssigneesError}</p>
              ) : null}
              <p className="task-manage-preview">
                {t("tasksManage.previewRule", {
                  when: permanentWhenText,
                  assignees: permanentAssigneesText,
                  activeState: permanentForm.active ? t("tasksManage.active") : t("tasksManage.inactive"),
                })}
              </p>
              <div className="task-manage-form-actions">
                <button type="button" className="btn btn-primary" onClick={submitPermanent} disabled={!isPermanentFormValid}>
                  <IconPlus size={16} />
                  {t("tasksManage.addPermanent")}
                </button>
              </div>
            </div>
            {permanentTasks.length === 0 ? (
              <p className="empty">{t("tasksManage.permanentEmpty")}</p>
            ) : (
              <ul className="task-manage-list">
                {permanentTasks.map((taskItem) => {
                  const assignees = taskItem.assignees?.length ? taskItem.assignees : [taskItem.assignee];
                  const names = assignees
                    .map((id) => MEMBERS.find((m) => m.id === id)?.shortName ?? id)
                    .join(", ");
                  const isEdit = editingPermanentId === taskItem.id && editingPermanent;
                  return (
                    <li key={taskItem.id} className="task-manage-item">
                      {isEdit && editingPermanent ? (
                        <div className="task-manage-form">
                          <input
                            className="task-manage-input"
                            value={editingPermanent.title}
                            onChange={(e) => setEditingPermanent({ ...editingPermanent, title: e.target.value })}
                          />
                          <label className="task-manage-label">
                            {t("tasksManage.slotLabel")}
                            <select
                              value={editingPermanent.scheduleMode === "time" ? EXACT_TIME_OPTION : editingPermanent.slot}
                              onChange={(e) => {
                                const selected = e.target.value as ScheduleSelectValue;
                                if (selected === EXACT_TIME_OPTION) {
                                  setEditingPermanent({
                                    ...editingPermanent,
                                    scheduleMode: "time",
                                  });
                                  return;
                                }
                                setEditingPermanent({
                                  ...editingPermanent,
                                  scheduleMode: "slot",
                                  slot: selected,
                                  plannedTime: undefined,
                                });
                              }}
                            >
                              {scheduleOptions.map((s) => (
                                <option key={s.value} value={s.value}>
                                  {s.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          {editingPermanent.scheduleMode === "time" ? (
                            <label className="task-manage-label">
                              {t("tasksManage.exactTimeLabel")}
                              <input
                                className="task-manage-input"
                                type="time"
                                value={editingPermanent.plannedTime ?? ""}
                                onChange={(e) =>
                                  setEditingPermanent({
                                    ...editingPermanent,
                                    plannedTime: e.target.value ? e.target.value : undefined,
                                  })
                                }
                              />
                            </label>
                          ) : null}
                          <label className="checkbox-line task-manage-inline-check">
                            <input
                              type="checkbox"
                              checked={editingPermanent.active}
                              onChange={(e) => setEditingPermanent({ ...editingPermanent, active: e.target.checked })}
                            />
                            {t("tasksManage.activeLabel")}
                          </label>
                          <div className="task-manage-assignees-grid">
                            {MEMBERS.map((mem) => (
                              <label key={mem.id} className="checkbox-line task-manage-inline-check">
                                <input
                                  type="checkbox"
                                  checked={editingPermanent.assignees.includes(mem.id)}
                                  onChange={() => togglePermanentAssignee(mem.id, "edit")}
                                />
                                {mem.shortName}
                              </label>
                            ))}
                          </div>
                          <div className="task-manage-form-actions">
                            <button type="button" className="btn btn-primary" onClick={savePermanentEdit}>
                              <IconCheck size={16} />
                              {t("tasksManage.save")}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => {
                                setEditingPermanentId(null);
                                setEditingPermanent(null);
                              }}
                            >
                              {t("tasksManage.cancel")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="task-manage-row">
                          <div className="task-manage-main">
                            <div className="task-manage-name">{taskItem.title}</div>
                            <div className="task-manage-meta">
                              <span>{t("tasksManage.assigneesLabel")}: {names}</span>
                              <span>· {t("tasksManage.whenLabel")}: {taskItem.plannedTime ?? slotShort(t, taskItem.slot)}</span>
                            <label className="checkbox-line task-manage-inline-check">
                              <input
                                type="checkbox"
                                checked={taskItem.active !== false}
                                onChange={(e) =>
                                  onUpdatePermanent(taskItem.id, {
                                    title: taskItem.title,
                                    assignees,
                                    slot: taskItem.slot,
                                    plannedTime: taskItem.plannedTime,
                                    active: e.target.checked,
                                  scheduleMode: taskItem.plannedTime ? "time" : "slot",
                                  })
                                }
                              />
                              {t("tasksManage.activeLabel")}
                            </label>
                              <span className="badge badge-daily">{t("tasksManage.dailyBadge")}</span>
                            </div>
                            <div className="task-manage-meta">
                              <span>{t("tasksManage.anyAssigneeDone")}</span>
                            </div>
                          </div>
                          <div className="task-manage-toolbar">
                            <button type="button" className="btn btn-ghost" onClick={() => startEditPermanent(taskItem)}>
                              <IconPencil size={16} />
                            </button>
                            <button type="button" className="btn btn-warn" onClick={() => tryDelete(taskItem)}>
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
          </div>
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
