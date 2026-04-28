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

export function parseHHMMToMinutes(value?: string): number | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

export function slotFromMinutes(totalMinutes: number): Exclude<TimeSlot, "any"> | "sleep" {
  const h = Math.floor(totalMinutes / 60);
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "day";
  if (h >= 17 && h < 22) return "evening";
  if (h >= 22 || h < 1) return "night";
  return "sleep";
}

export function phaseTimeRange(phase: DayPhase): string {
  const { start, end } = DAY_PHASE_HOURS[phase];
  if (phase === "night") return "22:00 — 01:00";
  if (phase === "sleep") return "01:00 — 05:00";
  const e = end >= 24 ? end - 24 : end;
  return `${String(start).padStart(2, "0")}:00 — ${String(e).padStart(2, "0")}:00`;
}
