import type { FabricActorId } from "./fabricIds";
import type { DayPhase, FamilyMember, MemberId, Pet, PetRoutineSlot } from "./types";

/** Deterministic Fabric Actor ids (`User` + legacy slug) — must match `server/defaultAppState.mjs` / migration. */
export const DEFAULT_MEMBERS: FamilyMember[] = [
  { id: "31e383d43e009fad78abc78c2f5c35045f07fd6ff815d6e123693bf559c3c3ac", shortName: "Аня", fullName: "Аня", role: "Мама", color: "#c56c86" },
  { id: "ef4b0d206947925b207023f0c56563a2117d89828209e87901f5a04faec79eea", shortName: "Серёжа", fullName: "Серёжа", role: "Мужик", color: "#6b8f71" },
  { id: "d7c73fa3b771ff8af5d794898328b21edfa20707166b7b6d7047cb7bc2e74810", shortName: "Тамара", fullName: "Тамара", role: "Дочь", color: "#7b9eb8" },
  { id: "45db53f019ce76bb081616059c8570ca0023c89422adaf1c70b5e58e2cd4d2c1", shortName: "Лука", fullName: "Лука", role: "Сын", color: "#d4a574" },
];

/** @deprecated Prefer `users` from persisted app state (`state.users`), falling back to `DEFAULT_MEMBERS`. */
export const MEMBERS = DEFAULT_MEMBERS;

/** `FamilyTasks/Pet` Actor ids — must match `server/fabricDocumentMigration.mjs` (`deterministicFabricEntityId("Pet", …)`). */
export const PETS: Pet[] = [
  { id: "9ccc19c236aeeeeeed95c0dcc5b62151b41c421cbb2f79c4559c9c52b7246f77", name: "Борис", species: "cat" },
  { id: "02c4312940025dbdab301f5ace262bec67229d50763e2a345accad90f80ca802", name: "Абрикос", species: "cat" },
  { id: "ad5d146464a060950e85509dbaf4d7a0c641a72b36c9fabf16363008abec82b3", name: "Лиса", species: "cat" },
  { id: "466987dbf57f1a3041c9123e988404f540ca2c2da1343d6894519a3a9bcb40d5", name: "Фарида", species: "dog" },
  { id: "719e6cf78549bb3e27851edc9eb1d72593596a800d5f3016d70f06e68b74de8f", name: "Потап", species: "dog" },
];

/** Кто по умолчанию кормит/выгуливает — ключи: Fabric id питомца → Fabric id члена семьи */
export const DEFAULT_PET_ASSIGNEE: Record<FabricActorId, MemberId> = {
  "9ccc19c236aeeeeeed95c0dcc5b62151b41c421cbb2f79c4559c9c52b7246f77": "d7c73fa3b771ff8af5d794898328b21edfa20707166b7b6d7047cb7bc2e74810",
  "02c4312940025dbdab301f5ace262bec67229d50763e2a345accad90f80ca802": "d7c73fa3b771ff8af5d794898328b21edfa20707166b7b6d7047cb7bc2e74810",
  "ad5d146464a060950e85509dbaf4d7a0c641a72b36c9fabf16363008abec82b3": "d7c73fa3b771ff8af5d794898328b21edfa20707166b7b6d7047cb7bc2e74810",
  "466987dbf57f1a3041c9123e988404f540ca2c2da1343d6894519a3a9bcb40d5": "d7c73fa3b771ff8af5d794898328b21edfa20707166b7b6d7047cb7bc2e74810",
  "719e6cf78549bb3e27851edc9eb1d72593596a800d5f3016d70f06e68b74de8f": "d7c73fa3b771ff8af5d794898328b21edfa20707166b7b6d7047cb7bc2e74810",
};

/** Утро / день / вечер / почти ночь / время сна — границы в часах [start, end) по локальному времени */
export const DAY_PHASE_HOURS: Record<DayPhase, { start: number; end: number }> = {
  morning: { start: 5, end: 11 },
  day: { start: 11, end: 19 },
  evening: { start: 19, end: 22 },
  night: { start: 22, end: 1 },
  sleep: { start: 1, end: 5 },
};

function feedSlots(morning: number, evening: number): PetRoutineSlot[] {
  return [
    { kind: "feed", labelKey: "petRoutine.feedMorning", minutes: morning * 60 + 30 },
    { kind: "feed", labelKey: "petRoutine.feedEvening", minutes: evening * 60 + 30 },
  ];
}

/** Прогулки: утро, 18:00, перед сном — только собаки */
const dogWalks: PetRoutineSlot[] = [
  { kind: "walk", labelKey: "petRoutine.walkMorning", minutes: 8 * 60 },
  { kind: "walk", labelKey: "petRoutine.walk1800", minutes: 18 * 60 },
  { kind: "walk", labelKey: "petRoutine.walkBeforeSleep", minutes: 22 * 60 + 30 },
];

export function routineForPet(pet: Pet): PetRoutineSlot[] {
  if (pet.species === "cat") {
    return feedSlots(7, 19);
  }
  return [...feedSlots(7, 19), ...dogWalks];
}

export const FEED_WINDOW_MIN = 60;
