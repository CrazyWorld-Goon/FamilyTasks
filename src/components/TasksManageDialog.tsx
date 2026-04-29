import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { IconCheck, IconPencil, IconPlus, IconTrash, IconListChecks, IconClose } from "./Icons";
import { getEffectiveTaskStatus } from "../logic/taskDay";
import { DAILY_WEEKDAY_ORDER, normalizeWeekdays } from "../logic/taskSchedule";
import type { FamilyMember, MemberId, Task, TimeSlot } from "../types";

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
  fabricPublished: boolean;
};

type PermanentPayload = {
  title: string;
  assignees: MemberId[];
  slot: TimeSlot;
  plannedTime?: string;
  active: boolean;
  weekdays: number[];
  scheduleMode: "slot" | "time";
  fabricPublished: boolean;
};

type RegularCreatePayload = {
  title: string;
  assignees: MemberId[];
  slot: TimeSlot;
  plannedTime?: string;
  scheduleMode: "slot" | "time";
  notes: string;
  fabricPublished: boolean;
};

type WeekdayOption = {
  value: number;
  key: string;
};

const WEEKDAY_OPTIONS: WeekdayOption[] = [
  { value: 1, key: "mon" },
  { value: 2, key: "tue" },
  { value: 3, key: "wed" },
  { value: 4, key: "thu" },
  { value: 5, key: "fri" },
  { value: 6, key: "sat" },
  { value: 0, key: "sun" },
];

function defaultWeekdays(): number[] {
  return [...DAILY_WEEKDAY_ORDER];
}

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
  const assignees = task.assignees?.length ? task.assignees : [task.assignee];
  return {
    title: task.title,
    assignee: assignees[0] ?? task.assignee,
    assignees,
    slot: task.slot,
    plannedTime: task.plannedTime,
    scheduleMode: task.plannedTime ? "time" : "slot",
    notes: task.notes ?? "",
    daily: task.recurrence === "daily",
    status: task.status,
    fabricPublished: Boolean(task.fabricPublished),
  };
}

export function TasksManageDialog({
  open,
  onClose,
  tasks,
  members,
  dayKey,
  onUpdate,
  onCreateRegular,
  onCreatePermanent,
  onUpdatePermanent,
  onDelete,
  fabricTasksPublic = false,
}: {
  open: boolean;
  onClose: () => void;
  tasks: Task[];
  members: FamilyMember[];
  dayKey: string;
  onUpdate: (id: string, data: UpdatePayload) => void;
  onCreateRegular: (data: RegularCreatePayload) => void;
  onCreatePermanent: (data: PermanentPayload) => void;
  onUpdatePermanent: (id: string, data: PermanentPayload) => void;
  onDelete: (id: string) => void;
  fabricTasksPublic?: boolean;
}) {
  const { t, locale } = useI18n();
  const titleId = useId();
  const [mode, setMode] = useState<"regular" | "permanent">("regular");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UpdatePayload | null>(null);
  const [permanentForm, setPermanentForm] = useState<PermanentPayload>({
    title: "",
    assignees: [],
    slot: "day",
    plannedTime: undefined,
    active: true,
    weekdays: defaultWeekdays(),
    scheduleMode: "slot",
    fabricPublished: false,
  });
  const [editingPermanentId, setEditingPermanentId] = useState<string | null>(null);
  const [editingPermanent, setEditingPermanent] = useState<PermanentPayload | null>(null);
  const [permanentSubmitAttempted, setPermanentSubmitAttempted] = useState(false);
  const [permanentCreateOpen, setPermanentCreateOpen] = useState(false);
  const [regularCreateOpen, setRegularCreateOpen] = useState(false);
  const [regularSubmitAttempted, setRegularSubmitAttempted] = useState(false);
  const [regularCreateForm, setRegularCreateForm] = useState<RegularCreatePayload>({
    title: "",
    assignees: [],
    slot: "day",
    plannedTime: undefined,
    scheduleMode: "slot",
    notes: "",
    fabricPublished: false,
  });
  const [deleteConfirmTask, setDeleteConfirmTask] = useState<Task | null>(null);
  const regularCreateFormRef = useRef<HTMLDivElement | null>(null);
  const permanentCreateFormRef = useRef<HTMLDivElement | null>(null);

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
    const order = new Map(members.map((m, i) => [m.id, i]));
    const collator = locale === "ru" ? "ru" : "en";
    return [...tasks].sort((a, b) => {
      const oa = order.get(a.assignee) ?? 99;
      const ob = order.get(b.assignee) ?? 99;
      if (oa !== ob) return oa - ob;
      return a.title.localeCompare(b.title, collator);
    });
  }, [tasks, locale, members]);
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
      const assignees = form.assignees?.length ? form.assignees : [form.assignee];
      if (assignees.length === 0) return;
      const primaryAssignee = assignees[0] ?? form.assignee;
      const normalizedTime = form.plannedTime ? normalizeHHMM(form.plannedTime) : null;
      if (form.scheduleMode === "time" && !normalizedTime) return;
      onUpdate(id, {
        ...form,
        assignee: primaryAssignee,
        assignees,
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

  const toggleRegularCreateAssignee = useCallback((memberId: MemberId) => {
    setRegularCreateForm((prev) => {
      const exists = prev.assignees.includes(memberId);
      const next = exists ? prev.assignees.filter((id) => id !== memberId) : [...prev.assignees, memberId];
      return { ...prev, assignees: next.length > 0 ? next : prev.assignees };
    });
  }, []);

  const toggleRegularEditAssignee = useCallback((memberId: MemberId) => {
    setForm((prev) => {
      if (!prev) return prev;
      const current = prev.assignees?.length ? prev.assignees : [prev.assignee];
      const exists = current.includes(memberId);
      const next = exists ? current.filter((id) => id !== memberId) : [...current, memberId];
      if (next.length === 0) return prev;
      return { ...prev, assignees: next, assignee: next[0] ?? prev.assignee };
    });
  }, []);

  const togglePermanentWeekday = useCallback((weekday: number, target: "new" | "edit") => {
    if (target === "new") {
      setPermanentForm((prev) => {
        const exists = prev.weekdays.includes(weekday);
        const next = exists ? prev.weekdays.filter((v) => v !== weekday) : [...prev.weekdays, weekday];
        return { ...prev, weekdays: next.length > 0 ? next : prev.weekdays };
      });
      return;
    }
    setEditingPermanent((prev) => {
      if (!prev) return prev;
      const exists = prev.weekdays.includes(weekday);
      const next = exists ? prev.weekdays.filter((v) => v !== weekday) : [...prev.weekdays, weekday];
      return { ...prev, weekdays: next.length > 0 ? next : prev.weekdays };
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
      weekdays: normalizeWeekdays(permanentForm.weekdays) ?? defaultWeekdays(),
      slot: permanentForm.scheduleMode === "slot" ? permanentForm.slot : "any",
      plannedTime: permanentForm.scheduleMode === "time" ? normalizedTime ?? undefined : undefined,
    });
    setPermanentForm({
      title: "",
      assignees: [],
      slot: "day",
      plannedTime: undefined,
      active: true,
      weekdays: defaultWeekdays(),
      scheduleMode: "slot",
      fabricPublished: false,
    });
    setPermanentSubmitAttempted(false);
  }, [onCreatePermanent, permanentForm]);

  const submitRegularCreate = useCallback(() => {
    setRegularSubmitAttempted(true);
    const title = regularCreateForm.title.trim();
    if (!title || regularCreateForm.assignees.length === 0) return;
    const normalizedTime = regularCreateForm.plannedTime ? normalizeHHMM(regularCreateForm.plannedTime) : null;
    if (regularCreateForm.scheduleMode === "time" && !normalizedTime) return;
    onCreateRegular({
      ...regularCreateForm,
      title,
      slot: regularCreateForm.scheduleMode === "slot" ? regularCreateForm.slot : "any",
      plannedTime: regularCreateForm.scheduleMode === "time" ? normalizedTime ?? undefined : undefined,
      notes: regularCreateForm.notes.trim(),
    });
    setRegularCreateForm({
      title: "",
      assignees: [],
      slot: "day",
      plannedTime: undefined,
      scheduleMode: "slot",
      notes: "",
      fabricPublished: false,
    });
    setRegularSubmitAttempted(false);
    setRegularCreateOpen(false);
  }, [onCreateRegular, regularCreateForm]);

  const startEditPermanent = useCallback((task: Task) => {
    const assignees = task.assignees?.length ? task.assignees : [task.assignee];
    setEditingPermanentId(task.id);
    setEditingPermanent({
      title: task.title,
      slot: task.slot,
      assignees,
      plannedTime: task.plannedTime,
      active: task.active !== false,
      weekdays: normalizeWeekdays(task.weekdays) ?? defaultWeekdays(),
      scheduleMode: task.plannedTime ? "time" : "slot",
      fabricPublished: Boolean(task.fabricPublished),
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
      weekdays: normalizeWeekdays(editingPermanent.weekdays) ?? defaultWeekdays(),
      slot: editingPermanent.scheduleMode === "slot" ? editingPermanent.slot : "any",
      plannedTime: editingPermanent.scheduleMode === "time" ? normalizedTime ?? undefined : undefined,
    });
    setEditingPermanentId(null);
    setEditingPermanent(null);
  }, [editingPermanent, editingPermanentId, onUpdatePermanent]);

  const tryDelete = useCallback(
    (task: Task) => {
      setDeleteConfirmTask(task);
    },
    [],
  );

  const confirmDelete = useCallback(() => {
    if (!deleteConfirmTask) return;
    onDelete(deleteConfirmTask.id);
    if (editingId === deleteConfirmTask.id) cancelEdit();
    if (editingPermanentId === deleteConfirmTask.id) {
      setEditingPermanentId(null);
      setEditingPermanent(null);
    }
    setDeleteConfirmTask(null);
  }, [deleteConfirmTask, onDelete, editingId, cancelEdit, editingPermanentId]);

  const scrollToRegularCreateForm = useCallback(() => {
    regularCreateFormRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const scrollToPermanentCreateForm = useCallback(() => {
    permanentCreateFormRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const openRegularCreate = useCallback(() => {
    setRegularSubmitAttempted(false);
    if (regularCreateOpen) {
      window.requestAnimationFrame(scrollToRegularCreateForm);
      return;
    }
    setRegularCreateOpen(true);
  }, [regularCreateOpen, scrollToRegularCreateForm]);

  const openPermanentCreate = useCallback(() => {
    setPermanentSubmitAttempted(false);
    if (permanentCreateOpen) {
      window.requestAnimationFrame(scrollToPermanentCreateForm);
      return;
    }
    setPermanentCreateOpen(true);
  }, [permanentCreateOpen, scrollToPermanentCreateForm]);

  useEffect(() => {
    if (!open) {
      setMode("regular");
      setEditingId(null);
      setForm(null);
      setEditingPermanentId(null);
      setEditingPermanent(null);
      setPermanentSubmitAttempted(false);
      setPermanentCreateOpen(false);
      setRegularCreateOpen(false);
      setRegularSubmitAttempted(false);
      setRegularCreateForm({
        title: "",
        assignees: [],
        slot: "day",
        plannedTime: undefined,
        scheduleMode: "slot",
        notes: "",
        fabricPublished: false,
      });
      setDeleteConfirmTask(null);
    }
  }, [open]);

  useEffect(() => {
    if (!regularCreateOpen) return;
    const id = window.requestAnimationFrame(scrollToRegularCreateForm);
    return () => window.cancelAnimationFrame(id);
  }, [regularCreateOpen, scrollToRegularCreateForm]);

  useEffect(() => {
    if (!permanentCreateOpen) return;
    const id = window.requestAnimationFrame(scrollToPermanentCreateForm);
    return () => window.cancelAnimationFrame(id);
  }, [permanentCreateOpen, scrollToPermanentCreateForm]);

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
  const permanentWeekdaysError = useMemo(
    () => (permanentForm.weekdays.length > 0 ? null : t("tasksManage.validationWeekdaysRequired")),
    [permanentForm.weekdays.length, t],
  );
  const permanentTimeError = useMemo(() => {
    if (permanentForm.scheduleMode !== "time") return null;
    if (!permanentForm.plannedTime) return t("tasksManage.validationTimeRequired");
    return normalizedPermanentTime ? null : t("tasksManage.validationTimeInvalid");
  }, [normalizedPermanentTime, permanentForm.plannedTime, permanentForm.scheduleMode, t]);
  const isPermanentFormValid = !permanentTitleError && !permanentAssigneesError && !permanentWeekdaysError && !permanentTimeError;
  const permanentAssigneesText = useMemo(() => {
    const names = permanentForm.assignees
      .map((id) => members.find((m) => m.id === id)?.shortName ?? id)
      .join(", ");
    return names || t("tasksManage.assigneesNoneSelected");
  }, [permanentForm.assignees, members, t]);
  const permanentWhenText = permanentForm.scheduleMode === "time"
    ? normalizedPermanentTime ?? (permanentForm.plannedTime || "--:--")
    : slotShort(t, permanentForm.slot);
  const weekdayLabelByValue = useMemo(
    () =>
      new Map<number, string>(
        WEEKDAY_OPTIONS.map((item) => [item.value, t(`tasksManage.weekdaysShort.${item.key}`)]),
      ),
    [t],
  );
  const permanentDaysText = useMemo(() => {
    const normalized = normalizeWeekdays(permanentForm.weekdays) ?? defaultWeekdays();
    if (normalized.length === 7) return t("tasksManage.weekdaysAll");
    return normalized
      .map((value) => weekdayLabelByValue.get(value) ?? String(value))
      .join(", ");
  }, [permanentForm.weekdays, t, weekdayLabelByValue]);
  const normalizedRegularTime = useMemo(
    () => (regularCreateForm.plannedTime ? normalizeHHMM(regularCreateForm.plannedTime) : null),
    [regularCreateForm.plannedTime],
  );
  const regularTitleError = useMemo(
    () => (regularCreateForm.title.trim() ? null : t("tasksManage.validationTitleRequired")),
    [regularCreateForm.title, t],
  );
  const regularAssigneesError = useMemo(
    () => (regularCreateForm.assignees.length > 0 ? null : t("tasksManage.validationAssigneeRequired")),
    [regularCreateForm.assignees.length, t],
  );
  const regularAssigneesText = useMemo(() => {
    const names = regularCreateForm.assignees
      .map((id) => members.find((m) => m.id === id)?.shortName ?? id)
      .join(", ");
    return names || t("tasksManage.assigneesNoneSelected");
  }, [members, regularCreateForm.assignees, t]);
  const regularTimeError = useMemo(() => {
    if (regularCreateForm.scheduleMode !== "time") return null;
    if (!regularCreateForm.plannedTime) return t("tasksManage.validationTimeRequired");
    return normalizedRegularTime ? null : t("tasksManage.validationTimeInvalid");
  }, [normalizedRegularTime, regularCreateForm.plannedTime, regularCreateForm.scheduleMode, t]);
  const isRegularCreateValid = !regularTitleError && !regularAssigneesError && !regularTimeError;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (deleteConfirmTask) {
        setDeleteConfirmTask(null);
        return;
      }
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
  }, [open, onClose, editingId, editingPermanentId, deleteConfirmTask]);

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
          <div className="task-manage-regular">
            <button
              type="button"
              className="btn btn-primary task-manage-add-cta"
              onClick={openRegularCreate}
            >
              <IconPlus size={16} />
              {t("tasksManage.addRegularCta")}
            </button>
            {regularTasks.length === 0 ? (
              <p className="empty">{t("tasksManage.empty")}</p>
            ) : (
              <ul className="task-manage-list">
                {regularTasks.map((taskItem) => {
                  const eff = getEffectiveTaskStatus(taskItem, dayKey);
                  const assignees = taskItem.assignees?.length ? taskItem.assignees : [taskItem.assignee];
                  const names = assignees
                    .map((id) => members.find((x) => x.id === id)?.shortName ?? id)
                    .join(", ");
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
                            <div className="task-manage-label">
                              {t("tasksManage.assigneeLabel")}
                              <div className="task-manage-member-pills" role="group" aria-label={t("tasksManage.assigneeLabel")}>
                                {members.map((mem) => {
                                  const selected = (form.assignees?.length ? form.assignees : [form.assignee]).includes(mem.id);
                                  return (
                                    <button
                                      key={mem.id}
                                      type="button"
                                      className={selected ? "btn btn-primary task-request-member-btn" : "btn btn-ghost task-request-member-btn"}
                                      onClick={() => toggleRegularEditAssignee(mem.id)}
                                      aria-pressed={selected}
                                    >
                                      {mem.shortName}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
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
                          {fabricTasksPublic ? (
                            <label className="checkbox-line task-manage-inline-check">
                              <input
                                type="checkbox"
                                checked={form.fabricPublished}
                                onChange={(e) => setForm({ ...form, fabricPublished: e.target.checked })}
                              />
                              {t("tasksManage.publishOnFabric")}
                            </label>
                          ) : null}
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
                              <span>{t("tasksManage.assigneesLabel")}: {names}</span>
                              <span>· {taskItem.plannedTime ?? slotShort(t, taskItem.slot)}</span>
                              {taskItem.recurrence === "daily" ? (
                                <span className="badge badge-daily">{t("tasksManage.dailyBadge")}</span>
                              ) : null}
                              {fabricTasksPublic && taskItem.fabricPublished ? (
                                <span className="badge badge-fabric" title={t("tasksManage.publishOnFabricHint")}>
                                  {t("tasksManage.fabricBadge")}
                                </span>
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
            <button
              type="button"
              className="btn btn-primary task-manage-add-cta"
              onClick={openRegularCreate}
            >
              <IconPlus size={16} />
              {t("tasksManage.addRegularCta")}
            </button>
            {regularCreateOpen ? (
              <div ref={regularCreateFormRef} className="task-manage-form task-manage-form--regular-create">
                <input
                  className="task-manage-input"
                  value={regularCreateForm.title}
                  onChange={(e) => setRegularCreateForm((prev) => ({ ...prev, title: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    submitRegularCreate();
                  }}
                  placeholder={t("tasksManage.regularTitlePlaceholder")}
                  aria-label={t("tasksManage.regularTitleAria")}
                />
                {regularSubmitAttempted && regularTitleError ? <p className="task-manage-error">{regularTitleError}</p> : null}
                <div className="task-manage-form-row">
                  <label className="task-manage-label task-manage-label--compact">
                    {t("tasksManage.slotLabel")}
                    <select
                      value={regularCreateForm.scheduleMode === "time" ? EXACT_TIME_OPTION : regularCreateForm.slot}
                      onChange={(e) => {
                        const selected = e.target.value as ScheduleSelectValue;
                        if (selected === EXACT_TIME_OPTION) {
                          setRegularCreateForm((prev) => ({ ...prev, scheduleMode: "time" }));
                          return;
                        }
                        setRegularCreateForm((prev) => ({
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
                  <div className="task-manage-label task-manage-label--compact">
                    {t("tasksManage.assigneeLabel")}
                    <div className="task-manage-member-pills" role="group" aria-label={t("tasksManage.assigneeLabel")}>
                      {members.map((mem) => {
                        const selected = regularCreateForm.assignees.includes(mem.id);
                        return (
                          <button
                            key={mem.id}
                            type="button"
                            className={selected ? "btn btn-primary task-request-member-btn" : "btn btn-ghost task-request-member-btn"}
                            onClick={() => toggleRegularCreateAssignee(mem.id)}
                            aria-pressed={selected}
                          >
                            {mem.shortName}
                          </button>
                        );
                      })}
                    </div>
                    <p className="task-manage-assignees-summary">
                      {t("tasksManage.assigneesSummary", { names: regularAssigneesText })}
                    </p>
                  </div>
                  {regularCreateForm.scheduleMode === "time" ? (
                    <label className="task-manage-label task-manage-label--compact">
                      {t("tasksManage.exactTimeLabel")}
                      <input
                        className="task-manage-input"
                        type="time"
                        value={regularCreateForm.plannedTime ?? ""}
                        onChange={(e) =>
                          setRegularCreateForm((prev) => ({ ...prev, plannedTime: e.target.value ? e.target.value : undefined }))
                        }
                      />
                    </label>
                  ) : null}
                </div>
                {regularSubmitAttempted && regularTimeError ? <p className="task-manage-error">{regularTimeError}</p> : null}
                {regularSubmitAttempted && regularAssigneesError ? (
                  <p className="task-manage-error">{regularAssigneesError}</p>
                ) : null}
                <label className="task-manage-label">
                  {t("tasksManage.notesLabel")}
                  <textarea
                    value={regularCreateForm.notes}
                    onChange={(e) => setRegularCreateForm((prev) => ({ ...prev, notes: e.target.value }))}
                    rows={2}
                  />
                </label>
                {fabricTasksPublic ? (
                  <label className="checkbox-line task-manage-inline-check">
                    <input
                      type="checkbox"
                      checked={regularCreateForm.fabricPublished}
                      onChange={(e) => setRegularCreateForm((prev) => ({ ...prev, fabricPublished: e.target.checked }))}
                    />
                    {t("tasksManage.publishOnFabric")}
                  </label>
                ) : null}
                <div className="task-manage-form-actions task-manage-form-actions--split">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setRegularCreateOpen(false);
                      setRegularSubmitAttempted(false);
                    }}
                  >
                    {t("tasksManage.cancel")}
                  </button>
                  <button type="button" className="btn btn-primary" onClick={submitRegularCreate} disabled={!isRegularCreateValid}>
                    <IconPlus size={16} />
                    {t("tasksManage.addRegular")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="task-manage-permanent">
            <button
              type="button"
              className="btn btn-primary task-manage-add-cta"
              onClick={openPermanentCreate}
            >
              <IconPlus size={16} />
              {t("tasksManage.addPermanent")}
            </button>
            {permanentTasks.length === 0 ? (
              <p className="empty">{t("tasksManage.permanentEmpty")}</p>
            ) : (
              <ul className="task-manage-list">
                {permanentTasks.map((taskItem) => {
                  const assignees = taskItem.assignees?.length ? taskItem.assignees : [taskItem.assignee];
                  const names = assignees
                    .map((id) => members.find((m) => m.id === id)?.shortName ?? id)
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
                          <div className="task-manage-assignees">
                            <span className="task-manage-label-text">{t("tasksManage.activeLabel")}</span>
                            <div className="task-manage-member-pills" role="group" aria-label={t("tasksManage.activeLabel")}>
                              <button
                                type="button"
                                className={
                                  editingPermanent.active
                                    ? "btn task-request-member-btn task-active-toggle-pill task-active-toggle-pill--on"
                                    : "btn task-request-member-btn task-active-toggle-pill task-active-toggle-pill--off"
                                }
                                aria-pressed={editingPermanent.active}
                                onClick={() => setEditingPermanent({ ...editingPermanent, active: !editingPermanent.active })}
                              >
                                {editingPermanent.active ? t("tasksManage.active") : t("tasksManage.inactive")}
                              </button>
                            </div>
                          </div>
                          <div className="task-manage-assignees">
                            <span className="task-manage-label-text">{t("tasksManage.weekdaysLabel")}</span>
                            <div className="task-manage-member-pills task-manage-weekday-pills" role="group" aria-label={t("tasksManage.weekdaysLabel")}>
                              {WEEKDAY_OPTIONS.map((day) => (
                                <button
                                  key={day.value}
                                  type="button"
                                  className={
                                    editingPermanent.weekdays.includes(day.value)
                                      ? "btn btn-primary task-request-member-btn task-weekday-pill"
                                      : "btn btn-ghost task-request-member-btn task-weekday-pill"
                                  }
                                  aria-pressed={editingPermanent.weekdays.includes(day.value)}
                                  onClick={() => togglePermanentWeekday(day.value, "edit")}
                                >
                                  {t(`tasksManage.weekdaysShort.${day.key}`)}
                                </button>
                              ))}
                            </div>
                          </div>
                          {fabricTasksPublic ? (
                            <label className="checkbox-line task-manage-inline-check">
                              <input
                                type="checkbox"
                                checked={editingPermanent.fabricPublished}
                                onChange={(e) =>
                                  setEditingPermanent({
                                    ...editingPermanent,
                                    fabricPublished: e.target.checked,
                                  })
                                }
                              />
                              {t("tasksManage.publishOnFabric")}
                            </label>
                          ) : null}
                          <div className="task-manage-assignees-grid">
                            {members.map((mem) => (
                              <button
                                key={mem.id}
                                type="button"
                                className={
                                  editingPermanent.assignees.includes(mem.id)
                                    ? "btn btn-primary task-request-member-btn"
                                    : "btn btn-ghost task-request-member-btn"
                                }
                                onClick={() => togglePermanentAssignee(mem.id, "edit")}
                                aria-pressed={editingPermanent.assignees.includes(mem.id)}
                              >
                                {mem.shortName}
                              </button>
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
                            {fabricTasksPublic && taskItem.fabricPublished ? (
                              <span className="badge badge-fabric" title={t("tasksManage.publishOnFabricHint")}>
                                {t("tasksManage.fabricBadge")}
                              </span>
                            ) : null}
                            <span className="task-manage-meta-active-wrap">
                              <span
                                className={
                                  taskItem.active !== false
                                    ? "badge task-active-toggle-pill task-active-toggle-pill--on"
                                    : "badge task-active-toggle-pill task-active-toggle-pill--off"
                                }
                                aria-label={t("tasksManage.activeLabel")}
                              >
                                {taskItem.active !== false ? t("tasksManage.active") : t("tasksManage.inactive")}
                              </span>
                            </span>
                            <span className="badge badge-daily">{t("tasksManage.dailyBadge")}</span>
                            </div>
                            <div className="task-manage-meta">
                              <span>{t("tasksManage.anyAssigneeDone")}</span>
                              <span>· {t("tasksManage.weekdaysLabel")}: {(() => {
                                const normalized = normalizeWeekdays(taskItem.weekdays) ?? defaultWeekdays();
                                if (normalized.length === 7) return t("tasksManage.weekdaysAll");
                                return normalized
                                  .map((value) => weekdayLabelByValue.get(value) ?? String(value))
                                  .join(", ");
                              })()}</span>
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
            <button
              type="button"
              className="btn btn-primary task-manage-add-cta"
              onClick={openPermanentCreate}
            >
              <IconPlus size={16} />
              {t("tasksManage.addPermanent")}
            </button>
            {permanentCreateOpen ? (
              <div ref={permanentCreateFormRef} className="task-manage-form task-manage-form--permanent">
                <input
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
                <div className="task-manage-assignees">
                  <span className="task-manage-label-text">{t("tasksManage.activeLabel")}</span>
                  <div className="task-manage-member-pills" role="group" aria-label={t("tasksManage.activeLabel")}>
                    <button
                      type="button"
                      className={
                        permanentForm.active
                          ? "btn task-request-member-btn task-active-toggle-pill task-active-toggle-pill--on"
                          : "btn task-request-member-btn task-active-toggle-pill task-active-toggle-pill--off"
                      }
                      aria-pressed={permanentForm.active}
                      onClick={() => setPermanentForm((prev) => ({ ...prev, active: !prev.active }))}
                    >
                      {permanentForm.active ? t("tasksManage.active") : t("tasksManage.inactive")}
                    </button>
                  </div>
                </div>
                <div className="task-manage-assignees">
                  <span className="task-manage-label-text">{t("tasksManage.weekdaysLabel")}</span>
                  <div className="task-manage-member-pills task-manage-weekday-pills" role="group" aria-label={t("tasksManage.weekdaysLabel")}>
                    {WEEKDAY_OPTIONS.map((day) => (
                      <button
                        key={day.value}
                        type="button"
                        className={
                          permanentForm.weekdays.includes(day.value)
                            ? "btn btn-primary task-request-member-btn task-weekday-pill"
                            : "btn btn-ghost task-request-member-btn task-weekday-pill"
                        }
                        aria-pressed={permanentForm.weekdays.includes(day.value)}
                        onClick={() => togglePermanentWeekday(day.value, "new")}
                      >
                        {t(`tasksManage.weekdaysShort.${day.key}`)}
                      </button>
                    ))}
                  </div>
                </div>
                {fabricTasksPublic ? (
                  <label className="checkbox-line task-manage-inline-check">
                    <input
                      type="checkbox"
                      checked={permanentForm.fabricPublished}
                      onChange={(e) =>
                        setPermanentForm((prev) => ({ ...prev, fabricPublished: e.target.checked }))
                      }
                    />
                    {t("tasksManage.publishOnFabric")}
                  </label>
                ) : null}
                <div className="task-manage-assignees">
                  <span className="task-manage-label-text">{t("tasksManage.assigneesLabel")}</span>
                  <div className="task-manage-assignees-grid">
                    {members.map((mem) => (
                      <button
                        key={mem.id}
                        type="button"
                        className={
                          permanentForm.assignees.includes(mem.id)
                            ? "btn btn-primary task-request-member-btn"
                            : "btn btn-ghost task-request-member-btn"
                        }
                        onClick={() => togglePermanentAssignee(mem.id, "new")}
                        aria-pressed={permanentForm.assignees.includes(mem.id)}
                      >
                        {mem.shortName}
                      </button>
                    ))}
                  </div>
                  <p className="task-manage-assignees-summary">
                    {t("tasksManage.assigneesSummary", { names: permanentAssigneesText })}
                  </p>
                </div>
                {permanentSubmitAttempted && permanentAssigneesError ? (
                  <p className="task-manage-error">{permanentAssigneesError}</p>
                ) : null}
                {permanentSubmitAttempted && permanentWeekdaysError ? (
                  <p className="task-manage-error">{permanentWeekdaysError}</p>
                ) : null}
                <p className="task-manage-preview">
                  {t("tasksManage.previewRule", {
                    when: permanentWhenText,
                    days: permanentDaysText,
                    assignees: permanentAssigneesText,
                    activeState: permanentForm.active ? t("tasksManage.active") : t("tasksManage.inactive"),
                  })}
                </p>
                <div className="task-manage-form-actions task-manage-form-actions--split">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setPermanentCreateOpen(false);
                      setPermanentSubmitAttempted(false);
                    }}
                  >
                    {t("tasksManage.cancel")}
                  </button>
                  <button type="button" className="btn btn-primary" onClick={submitPermanent} disabled={!isPermanentFormValid}>
                    <IconPlus size={16} />
                    {t("tasksManage.addPermanent")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        <div className="task-manage-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t("tasksManage.doneButton")}
          </button>
        </div>

        {deleteConfirmTask ? (
          <div className="confirm-backdrop" role="presentation" onClick={() => setDeleteConfirmTask(null)}>
            <div
              className="confirm-dialog card"
              role="dialog"
              aria-modal="true"
              aria-label={t("tasksManage.deleteTitle")}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>{t("tasksManage.deleteTitle")}</h3>
              <p className="section-hint">{t("tasksManage.deleteConfirm", { title: deleteConfirmTask.title })}</p>
              <div className="confirm-actions">
                <button type="button" className="btn btn-cancel-done" onClick={confirmDelete}>
                  {t("tasksManage.deleteTitle")}
                </button>
                <button type="button" className="btn btn-keep-done" onClick={() => setDeleteConfirmTask(null)}>
                  {t("tasksManage.cancel")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
