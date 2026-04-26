import { DEFAULT_PET_ASSIGNEE, FEED_WINDOW_MIN, PETS, routineForPet } from "../constants";
import type { MemberId, PetCareKind, TaskStatus, VirtualPetTask } from "../types";
import { inWindow, minutesFromMidnight } from "./time";

export function petTaskKey(
  dateKey: string,
  petId: string,
  kind: PetCareKind,
  plannedMinutes: number,
): string {
  return `${dateKey}|${petId}|${kind}|${plannedMinutes}`;
}

export function buildVirtualPetTasks(
  dateKey: string,
  now: Date,
  petCompletions: Record<string, TaskStatus>,
): VirtualPetTask[] {
  const nowMin = minutesFromMidnight(now);
  const out: VirtualPetTask[] = [];

  for (const pet of PETS) {
    const assignee: MemberId = DEFAULT_PET_ASSIGNEE[pet.id] ?? "anya";
    for (const slot of routineForPet(pet)) {
      const key = petTaskKey(dateKey, pet.id, slot.kind, slot.minutes);
      const status = petCompletions[key] ?? "planned";
      const isSoft = slot.kind === "walk";
      const inFeedWindow =
        slot.kind === "feed" && inWindow(nowMin, slot.minutes, FEED_WINDOW_MIN);

      out.push({
        id: key,
        title: `${pet.name} — ${slot.label}`,
        assignee,
        status,
        petId: pet.id,
        petName: pet.name,
        species: pet.species,
        kind: slot.kind,
        plannedMinutes: slot.minutes,
        inFeedWindow,
        isSoft,
      });
    }
  }
  return out;
}

export function formatPlanTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
