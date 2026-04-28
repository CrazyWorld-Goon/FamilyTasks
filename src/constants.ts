import type { DayPhase, FamilyMember, MemberId, Pet, PetRoutineSlot } from "./types";

export const MEMBERS: FamilyMember[] = [
  { id: "anya", shortName: "Аня", fullName: "Аня", role: "Мама", color: "#c56c86" },
  { id: "seryozha", shortName: "Серёжа", fullName: "Серёжа", role: "Мужик", color: "#6b8f71" },
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

/** Утро / день / вечер / почти ночь / время сна — границы в часах [start, end) по локальному времени */
export const DAY_PHASE_HOURS: Record<DayPhase, { start: number; end: number }> = {
  morning: { start: 5, end: 11 },
  day: { start: 11, end: 19 },
  evening: { start: 19, end: 22 },
  night: { start: 22, end: 1 },
  sleep: { start: 1, end: 5 },
};

/** Кто по умолчанию кормит/выгуливает (можно потом вынести в настройки) */
export const DEFAULT_PET_ASSIGNEE: Record<string, MemberId> = {
  boris: "tamara",
  abrikos: "tamara",
  lisa: "tamara",
  farida: "tamara",
  potap: "tamara",
};

export function routineForPet(_pet: Pet): PetRoutineSlot[] {
  return [];
}

export const FEED_WINDOW_MIN = 60;

