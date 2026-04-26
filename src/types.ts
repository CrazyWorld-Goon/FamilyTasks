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

/** Плановое время в минутах от полуночи */
export interface PetRoutineSlot {
  kind: PetCareKind;
  label: string;
  minutes: number;
}

export interface Task {
  id: string;
  title: string;
  assignee: MemberId;
  status: TaskStatus;
  slot: TimeSlot;
  /** ISO date YYYY-MM-DD, опционально */
  dueDate?: string;
  petId?: string;
  petKind?: PetCareKind;
  /** Связь с пунктом покупок */
  shoppingItemId?: string;
  notes?: string;
}

export type ShoppingStatus = "open" | "bought";

export interface ShoppingItem {
  id: string;
  title: string;
  /** Кому попадает в задачи (обычно мама) */
  assignee: MemberId;
  status: ShoppingStatus;
  createdAt: string;
}

export interface AppState {
  tasks: Task[];
  shopping: ShoppingItem[];
}

export type TabId = "all" | MemberId;

export type DayPhase = "morning" | "day" | "evening" | "night";

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
