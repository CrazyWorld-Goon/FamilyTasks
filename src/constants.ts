import type { DayPhase, FamilyMember, MemberId, Pet, PetRoutineSlot } from "./types";

export const STORAGE_KEY = "dom-i-zadachi-state-v1";

export const MEMBERS: FamilyMember[] = [
  { id: "anya", shortName: "Аня", fullName: "Аня", role: "Мама", color: "#c56c86" },
  { id: "seryozha", shortName: "Серёжа", fullName: "Серёжа", role: "Муж", color: "#6b8f71" },
  { id: "tamara", shortName: "Тамара", fullName: "Тамара", role: "Дочь", color: "#7b9eb8" },
  { id: "luka", shortName: "Лука", fullName: "Лука", role: "Сын", color: "#d4a574" },
];

export const PETS: Pet[] = [
  { id: "boris", name: "Борис", species: "cat" },
  { id: "abrikos", name: "Абрикос", species: "cat" },
  { id: "lisa", name: "Лиса", species: "cat" },
  { id: "farida", name: "Фарида", species: "dog" },
  { id: "potap", name: "Потап", species: "dog" },
];

/** Утро / день / вечер / ночь — границы в часах [start, end) по локальному времени */
export const DAY_PHASE_HOURS: Record<DayPhase, { start: number; end: number }> = {
  morning: { start: 5, end: 12 },
  day: { start: 12, end: 17 },
  evening: { start: 17, end: 22 },
  night: { start: 22, end: 29 }, // 29 = 5 next day, обрабатывается в логике
};

/** Кто по умолчанию кормит/выгуливает (можно потом вынести в настройки) */
export const DEFAULT_PET_ASSIGNEE: Record<string, MemberId> = {
  boris: "anya",
  abrikos: "tamara",
  lisa: "luka",
  farida: "seryozha",
  potap: "anya",
};

function feedSlots(morning: number, evening: number): PetRoutineSlot[] {
  return [
    { kind: "feed", label: "Корм (утро)", minutes: morning * 60 + 30 },
    { kind: "feed", label: "Корм (вечер)", minutes: evening * 60 + 30 },
  ];
}

/** Прогулки: утро, 18:00, перед сном — только собаки */
const dogWalks: PetRoutineSlot[] = [
  { kind: "walk", label: "Прогулка (утро)", minutes: 8 * 60 },
  { kind: "walk", label: "Прогулка (18:00)", minutes: 18 * 60 },
  { kind: "walk", label: "Прогулка (перед сном)", minutes: 22 * 60 + 30 },
];

export function routineForPet(pet: Pet): PetRoutineSlot[] {
  if (pet.species === "cat") {
    return feedSlots(7, 19);
  }
  return [...feedSlots(7, 19), ...dogWalks];
}

export const FEED_WINDOW_MIN = 60;
