import type { PersistedState } from "./storage";
import type { ShoppingItem, Task } from "./types";

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function createSeedState(now: Date = new Date()): PersistedState {
  const today = isoDate(now);
  const tasks: Task[] = [
    {
      id: "t1",
      title: "Разобрать завтраки",
      assignee: "anya",
      status: "planned",
      slot: "morning",
      dueDate: today,
    },
    {
      id: "t2",
      title: "Вынести мусор",
      assignee: "seryozha",
      status: "planned",
      slot: "evening",
      dueDate: today,
    },
    {
      id: "t3",
      title: "Уроки: математика",
      assignee: "tamara",
      status: "planned",
      slot: "day",
    },
    {
      id: "t4",
      title: "Почитать 20 минут",
      assignee: "luka",
      status: "planned",
      slot: "evening",
    },
    {
      id: "t5",
      title: "Полить цветы",
      assignee: "tamara",
      status: "planned",
      slot: "morning",
      dueDate: today,
    },
  ];

  const shopping: ShoppingItem[] = [
    {
      id: "s1",
      title: "Яйца",
      assignee: "anya",
      status: "open",
      createdAt: today,
    },
    {
      id: "s2",
      title: "Молоко",
      assignee: "anya",
      status: "open",
      createdAt: today,
    },
    {
      id: "s3",
      title: "Хлеб",
      assignee: "anya",
      status: "open",
      createdAt: today,
    },
    {
      id: "s4",
      title: "Лакомства для собак",
      assignee: "anya",
      status: "open",
      createdAt: today,
    },
    {
      id: "s5",
      title: "Бумага для принтера",
      assignee: "seryozha",
      status: "open",
      createdAt: today,
    },
  ];

  return {
    tasks,
    shopping,
    petCompletions: {},
  };
}
