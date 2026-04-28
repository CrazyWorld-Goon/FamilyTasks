import type { Task, TaskStatus } from "../types";

/** «Актуальный» статус с учётом смены календарного дня (ежедневные задачи). */
export function getEffectiveTaskStatus(task: Task, today: string): TaskStatus {
  if (task.recurrence === "daily") {
    if (task.status === "done" && task.lastCompletedOn === today) return "done";
    return "planned";
  }
  return task.status;
}
