import type { FabricActorId } from "./fabricIds";
import type { PeerViewTabId } from "./networkPeerTab";

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
  /** ISO-время, когда задачей поделились через кнопку «Попросить». */
  sharedAt?: string;
  petId?: FabricActorId;
  petKind?: PetCareKind;
  /** Связь с пунктом покупок */
  shoppingItemId?: FabricActorId;
  /** Пояснения, что именно сделать сегодня. */
  notes?: string;
  /**
   * When family network sharing ({@link FamilyState.fabricTasksPublic}) is on, this opts the task
   * into Fabric publication. Omitted/false = private to the household.
   */
  fabricPublished?: boolean;
}

export type ShoppingStatus = "open" | "bought";

export type TabId = "all" | "network" | "shop" | MemberId | PeerViewTabId;

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
  /**
   * When true, the household opts in to publishing tasks on the Fabric network so other
   * families can see and complete them (and this node can earn for work done elsewhere).
   * Only the primary organizer should change this; stored with persisted family state.
   */
  fabricTasksPublic?: boolean;
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
