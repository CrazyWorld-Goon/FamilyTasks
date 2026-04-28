import type { FabricActorId } from "./fabricIds";

/** Fabric {@link Actor#id} — family members, task/shopping assignees. */
export type MemberId = FabricActorId;

export type PetSpecies = "cat" | "dog";

export type TaskStatus = "planned" | "done" | "skipped" | "deferred";

export type TimeSlot = "morning" | "day" | "evening" | "night" | "any";

export type PetCareKind = "feed" | "walk";

export interface FamilyMember {
  id: FabricActorId;
  shortName: string;
  fullName: string;
  role: string;
  color: string;
}

/** Catalog pet — persisted references use {@link id} as Fabric Actor id (`FamilyTasks/Pet`). */
export interface Pet {
  id: FabricActorId;
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
  id: FabricActorId;
  title: string;
  assignee: MemberId;
  status: TaskStatus;
  slot: TimeSlot;
  /** ISO date YYYY-MM-DD, опционально */
  dueDate?: string;
  /** Если задано — снова в плане после смены дня, пока не отмечено сегодня. */
  recurrence?: "daily";
  /** Для daily: YYYY-MM-DD, когда в последний раз нажали «готово». */
  lastCompletedOn?: string;
  petId?: FabricActorId;
  petKind?: PetCareKind;
  /** Связь с пунктом покупок */
  shoppingItemId?: FabricActorId;
  /** Пояснения, что именно сделать сегодня. */
  notes?: string;
}

export type ShoppingStatus = "open" | "bought";

export type TabId = "all" | "network" | "shop" | MemberId;

export interface ShoppingItem {
  id: FabricActorId;
  title: string;
  /** Кому попадает в задачи (обычно мама) */
  assignee: MemberId;
  status: ShoppingStatus;
  createdAt: string;
  /** Когда отметили «куплено» (YYYY-MM-DD), для сортировки */
  boughtAt?: string;
}

export interface FamilyState {
  setupComplete: boolean;
  ownerUserId?: FabricActorId;
  displayName?: string;
  /** ISO timestamp when onboarding finished */
  setupCompletedAt?: string;
  /** e.g. `legacy` migration */
  source?: string;
}

export interface AppState {
  tasks: Task[];
  shopping: ShoppingItem[];
  /** Fabric Hub–aligned household lifecycle; one logical family per node. */
  family?: FamilyState;
  /** Family members (persisted). When empty, clients fall back to `DEFAULT_MEMBERS` in `constants.ts` unless {@link FamilyState.setupComplete} is false (first-run). */
  users?: FamilyMember[];
}

export type DayPhase = "morning" | "day" | "evening" | "night" | "sleep";

export interface VirtualPetTask {
  /** Composite key for UI — not a Fabric entity id. */
  id: string;
  title: string;
  assignee: MemberId;
  status: TaskStatus;
  petId: FabricActorId;
  petName: string;
  species: PetSpecies;
  kind: PetCareKind;
  plannedMinutes: number;
  /** В пределах ±60 мин от плана */
  inFeedWindow: boolean;
  /** Мягкий сценарий (прогулка) */
  isSoft: boolean;
}
