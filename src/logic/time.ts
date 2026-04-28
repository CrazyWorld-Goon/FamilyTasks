import { DAY_PHASE_HOURS } from "../constants";
import type { DayPhase, TimeSlot } from "../types";

export function minutesFromMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function getDayPhase(now: Date = new Date()): DayPhase {
  const h = now.getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "day";
  if (h >= 17 && h < 22) return "evening";
  if (h >= 22 || h < 1) return "night";
  return "sleep";
}

export function phaseLabel(p: DayPhase): string {
  switch (p) {
    case "morning":
      return "Утро";
    case "day":
      return "День";
    case "evening":
      return "Вечер";
    case "night":
      return "Почти ночь";
    case "sleep":
      return "Время сна";
  }
}

export function slotMatchesPhase(slot: TimeSlot, phase: DayPhase): boolean {
  if (slot === "any") return true;
  return slot === phase;
}

export function inWindow(nowMin: number, plannedMin: number, windowMin: number): boolean {
  const circDiff = Math.min(
    Math.abs(nowMin - plannedMin),
    Math.abs(nowMin - plannedMin + 24 * 60),
    Math.abs(nowMin - plannedMin - 24 * 60),
  );
  return circDiff <= windowMin;
}

export function phaseTimeRange(phase: DayPhase): string {
  const { start, end } = DAY_PHASE_HOURS[phase];
  if (phase === "night") return "22:00 — 01:00";
  if (phase === "sleep") return "01:00 — 05:00";
  const e = end >= 24 ? end - 24 : end;
  return `${String(start).padStart(2, "0")}:00 — ${String(e).padStart(2, "0")}:00`;
}
