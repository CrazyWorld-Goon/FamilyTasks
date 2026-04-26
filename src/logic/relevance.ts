import type { DayPhase, MemberId, ShoppingItem, Task, TaskStatus, TimeSlot, VirtualPetTask } from "../types";
import { getDayPhase, inWindow, slotMatchesPhase } from "./time";

/** Прогулка: показываем в «сейчас» в своём слоте + мягкое продление на соседнюю фазу */
export function petTaskRelevantNow(v: VirtualPetTask, phase: DayPhase, nowMin: number): boolean {
  if (v.status !== "planned") return false;
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

export function taskRelevantNow(t: Task, phase: DayPhase): boolean {
  if (t.status !== "planned") return false;
  return slotMatchesPhase(t.slot, phase);
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
  const members: MemberId[] = ["anya", "seryozha", "tamara", "luka"];
  return members.map((member) => {
    const relTasks = tasks.filter((t) => t.assignee === member && taskRelevantNow(t, phase));
    const relPets = virtualPets.filter((v) => v.assignee === member && petTaskRelevantNow(v, phase, nowMin));
    const shopTasks = shoppingAsTasksForMember(shopping, member).filter((t) => taskRelevantNow(t, phase));
    const planned =
      tasks.filter((t) => t.assignee === member && t.status === "planned").length +
      virtualPets.filter((v) => v.assignee === member && v.status === "planned").length +
      shopping.filter((s) => s.assignee === member && s.status === "open").length;
    return {
      member,
      relevant: relTasks.length + relPets.length + shopTasks.length,
      planned,
    };
  });
}
