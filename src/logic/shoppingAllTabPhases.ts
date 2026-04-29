import type { DayPhase, FamilyState } from "../types";

/** Порядок фаз дня как на вкладке «Дом» и в шапке. */
export const ALL_DAY_PHASES_ORDERED: DayPhase[] = ["morning", "day", "evening", "night", "sleep"];

/** Выбор для UI: если настройка не задана — считаем, что включены все фазы. */
export function normalizedShoppingPhasesAllTab(family: FamilyState | undefined): DayPhase[] {
  const sel = family?.shoppingVisiblePhasesAllTab;
  if (sel === undefined) return [...ALL_DAY_PHASES_ORDERED];
  return ALL_DAY_PHASES_ORDERED.filter((p) => sel.includes(p));
}

/** Показывать ли открытые покупки на вкладке «Все» в текущей фазе суток. */
export function shoppingVisibleOnAllTabForPhase(family: FamilyState | undefined, phase: DayPhase): boolean {
  const sel = family?.shoppingVisiblePhasesAllTab;
  if (sel === undefined) return true;
  return sel.includes(phase);
}

export function persistableShoppingPhasesAllTab(phases: DayPhase[]): DayPhase[] | undefined {
  const ordered = ALL_DAY_PHASES_ORDERED.filter((p) => phases.includes(p));
  if (ordered.length === ALL_DAY_PHASES_ORDERED.length) return undefined;
  return ordered;
}
