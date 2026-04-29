import type { Task } from "../types";

export const DAILY_WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export function weekdayFromDateKey(dateKey: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return null;
  const y = Number(m[1]);
  const mon = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mon) || !Number.isFinite(d)) return null;
  return new Date(y, mon - 1, d).getDay();
}

export function normalizeWeekdays(value?: number[]): number[] | undefined {
  if (!value || value.length === 0) return undefined;
  const allowed = new Set<number>(DAILY_WEEKDAY_ORDER);
  const unique = Array.from(new Set(value.filter((v) => Number.isInteger(v) && allowed.has(v))));
  if (unique.length === 0) return undefined;
  return DAILY_WEEKDAY_ORDER.filter((v) => unique.includes(v));
}

export function isTaskScheduledOnDay(task: Task, dayKey: string): boolean {
  if (task.recurrence !== "daily") return true;
  const weekday = weekdayFromDateKey(dayKey);
  if (weekday == null) return true;
  const weekdays = normalizeWeekdays(task.weekdays);
  if (!weekdays || weekdays.length === 0) return true;
  return weekdays.includes(weekday);
}
