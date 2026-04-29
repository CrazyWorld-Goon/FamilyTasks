import { getEffectiveTaskStatus } from "./taskDay";
import type { Task } from "../types";
import { parseHHMMToMinutes, slotFromMinutes } from "./time";
import { isTaskScheduledOnDay } from "./taskSchedule";

/**
 * Конец окна слота по тем же границам, что и getDayPhase (начало следующей фазы).
 * Для night конец считается в 01:00 следующего дня.
 */
const SLOT_END_HOUR: Record<"morning" | "day" | "evening" | "night", number> = {
  morning: 12,
  day: 17,
  evening: 22,
  night: 1,
};

function parseDateKey(dateKey: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return null;
  const y = Number(m[1]);
  const mon = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mon) || !Number.isFinite(d)) return null;
  return new Date(y, mon - 1, d, 0, 0, 0, 0);
}

function compareDateKeys(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function slotEndAt(task: Task, taskDayKey: string): Date | null {
  const plannedMinutes = parseHHMMToMinutes(task.plannedTime);
  const effectiveSlot = plannedMinutes != null ? slotFromMinutes(plannedMinutes) : task.slot;
  if (effectiveSlot === "any" || effectiveSlot === "sleep") return null;
  const base = parseDateKey(taskDayKey);
  if (!base) return null;
  const end = new Date(base);
  if (effectiveSlot === "night") {
    end.setDate(end.getDate() + 1);
  }
  end.setHours(SLOT_END_HOUR[effectiveSlot], 0, 0, 0);
  return end;
}

/**
 * Не выполнена и уже прошла верхняя граница её слота.
 * Для задач прошлых дней просрочка сохраняется во всех фазах до выполнения.
 */
export function isTaskSlotMissedToday(task: Task, now: Date, todayKey: string): boolean {
  if (!isTaskScheduledOnDay(task, todayKey)) return false;
  const plannedMinutes = parseHHMMToMinutes(task.plannedTime);
  const effectiveSlot = plannedMinutes != null ? slotFromMinutes(plannedMinutes) : task.slot;
  if (effectiveSlot === "any" || effectiveSlot === "sleep") return false;
  if (getEffectiveTaskStatus(task, todayKey) !== "planned") return false;

  // Daily tasks can have a deferred start day (stored in dueDate).
  if (task.recurrence === "daily" && task.dueDate) {
    const startCmp = compareDateKeys(todayKey, task.dueDate);
    if (startCmp < 0) return false;
  }

  const refDayKey = task.recurrence === "daily" ? todayKey : task.dueDate ?? todayKey;
  const dayCmp = compareDateKeys(todayKey, refDayKey);
  if (dayCmp > 0) return true;
  if (dayCmp < 0) return false;

  const endAt = slotEndAt(task, refDayKey);
  if (!endAt) return false;
  return now.getTime() >= endAt.getTime();
}
