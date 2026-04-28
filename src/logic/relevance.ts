import type { DayPhase, MemberId, ShoppingItem, Task, TaskStatus, TimeSlot, VirtualPetTask } from "../types";
import { getEffectiveTaskStatus } from "./taskDay";
import { isTaskSlotMissedToday } from "./slotMissed";
import { getDayPhase, inWindow, slotMatchesPhase } from "./time";

/** Окно «актуально по времени» для питомца — без учёта статуса (для строк «готово» в том же блоке). */
export function petRelevantWindow(v: VirtualPetTask, phase: DayPhase, nowMin: number): boolean {
  if (v.kind === "feed") {
    if (inWindow(nowMin, v.plannedMinutes, 60)) return true;
    const planH = Math.floor(v.plannedMinutes / 60);
    const curH = Math.floor(nowMin / 60);
    if (planH < 12 && curH >= 5 && curH < 12) return true;
    if (planH >= 17 && curH >= 17 && curH < 24) return true;
    return false;
  }
  const h = v.plannedMinutes / 60;
  if (h < 12) {
    return phase === "morning" || phase === "day";
  }
  if (h >= 17 && h < 21) {
    return phase === "day" || phase === "evening";
  }
  return phase === "evening" || phase === "night";
}

/** Прогулка: показываем в «сейчас» в своём слоте + мягкое продление на соседнюю фазу */
export function petTaskRelevantNow(v: VirtualPetTask, phase: DayPhase, nowMin: number): boolean {
  if (v.status !== "planned") return false;
  return petRelevantWindow(v, phase, nowMin);
}

/** Окно слота / фазы для задачи — без учёта статуса выполнения. */
export function taskRelevantWindow(t: Task, phase: DayPhase, today: string, now: Date = new Date()): boolean {
  if (t.slot === "any") return slotMatchesPhase(t.slot, phase);
  if (slotMatchesPhase(t.slot, phase)) return true;
  return isTaskSlotMissedToday(t, now, today);
}

export function taskRelevantNow(t: Task, phase: DayPhase, today: string, now: Date = new Date()): boolean {
  if (getEffectiveTaskStatus(t, today) !== "planned") return false;
  return taskRelevantWindow(t, phase, today, now);
}

export function shoppingAsTasksForMember(
  items: ShoppingItem[],
  member: MemberId,
): Task[] {
  return items
    .filter((i) => i.assignee === member && i.status === "open")
    .map((i) => ({
      id: `shop-${i.id}`,
      title: `Купить: ${i.title}`,
      assignee: i.assignee,
      status: "planned" as TaskStatus,
      slot: "any" as TimeSlot,
      shoppingItemId: i.id,
    }));
}

export function aggregateForAll(
  tasks: Task[],
  virtualPets: VirtualPetTask[],
  shopping: ShoppingItem[],
  now: Date = new Date(),
): { member: MemberId; relevant: number; planned: number }[] {
  const phase = getDayPhase(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const dkey = now.toISOString().slice(0, 10);
  const members: MemberId[] = ["anya", "seryozha", "tamara", "luka"];
  return members.map((member) => {
    const relTasks = tasks.filter((t) => t.assignee === member && taskRelevantNow(t, phase, dkey, now));
    const relPets = virtualPets.filter((v) => v.assignee === member && petTaskRelevantNow(v, phase, nowMin));
    const shopTasks = shoppingAsTasksForMember(shopping, member).filter((t) => taskRelevantNow(t, phase, dkey, now));
    const planned =
      tasks.filter((t) => t.assignee === member && getEffectiveTaskStatus(t, dkey) === "planned").length +
      virtualPets.filter((v) => v.assignee === member && v.status === "planned").length +
      shopping.filter((s) => s.assignee === member && s.status === "open").length;
    return {
      member,
      relevant: relTasks.length + relPets.length + shopTasks.length,
      planned,
    };
  });
}
