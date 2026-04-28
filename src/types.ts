export type MemberId = "anya" | "seryozha" | "tamara" | "luka";

export type PetSpecies = "cat" | "dog";

export type TaskStatus = "planned" | "done" | "skipped" | "deferred";

export type TimeSlot = "morning" | "day" | "evening" | "night" | "any";

export type PetCareKind = "feed" | "walk";

export interface FamilyMember {
  id: MemberId;
  shortName: string;
  fullName: string;
  role: string;
  color: string;
}

export interface Pet {
  id: string;
  name: string;
  species: PetSpecies;
}

/** Плановое время в минутах от полуночи. `labelKey` — путь в i18n (например petRoutine.feedMorning). */
export interface PetRoutineSlot {
  kind: PetCareKind;
  labelKey: string;
  minutes: number;
}

export interface Task {
  id: string;
  title: string;
  assignee: MemberId;
  /** Для постоянных/общих задач: несколько исполнителей, любой может закрыть задачу за день. */
  assignees?: MemberId[];
  /** Для постоянных задач: активность шаблона (если false — не показывать в ежедневных списках). */
  active?: boolean;
  status: TaskStatus;
  slot: TimeSlot;
  /** Опциональное точное время выполнения (HH:MM). */
  plannedTime?: string;
  /** ISO date YYYY-MM-DD, опционально */
  dueDate?: string;
  /** Если задано — снова в плане после смены дня, пока не отмечено сегодня. */
  recurrence?: "daily";
  /** Для daily: YYYY-MM-DD, когда в последний раз нажали «готово». */
  lastCompletedOn?: string;
  petId?: string;
  petKind?: PetCareKind;
  /** Связь с пунктом покупок */
  shoppingItemId?: string;
  /** Пояснения, что именно сделать сегодня. */
  notes?: string;
}

export type ShoppingStatus = "open" | "bought";

export type TabId = "all" | "shop" | MemberId;

export interface ShoppingItem {
  id: string;
  title: string;
  /** Кому попадает в задачи (обычно мама) */
  assignee: MemberId;
  status: ShoppingStatus;
  createdAt: string;
  /** Когда отметили «куплено» (YYYY-MM-DD), для сортировки */
  boughtAt?: string;
}

export interface AppState {
  tasks: Task[];
  shopping: ShoppingItem[];
}

export type DayPhase = "morning" | "day" | "evening" | "night" | "sleep";

export interface VirtualPetTask {
  id: string;
  title: string;
  assignee: MemberId;
  status: TaskStatus;
  petId: string;
  petName: string;
  species: PetSpecies;
  kind: PetCareKind;
  plannedMinutes: number;
  /** В пределах ±60 мин от плана */
  inFeedWindow: boolean;
  /** Мягкий сценарий (прогулка) */
  isSoft: boolean;
}
