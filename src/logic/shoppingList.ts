import type { MemberId, ShoppingItem } from "../types";

export function normalizeShoppingTitle(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Порядок как в состоянии: при отметке «куплено» строка не перескакивает. */
export function sortShoppingForDisplay(items: ShoppingItem[]): ShoppingItem[] {
  return items.filter((s) => s.status !== "rejected");
}

/**
 * Позиции «купить ещё»: уникальные купленные, которых сейчас нет в открытых
 * (сохраняем оформление названия и кого в задачи — с последнего купленного).
 */
export function getRepurchaseCandidates(
  items: ShoppingItem[],
): { id: string; title: string; assignee: MemberId; key: string; status: "bought" | "rejected" }[] {
  const openKeys = new Set(
    items.filter((s) => s.status === "open").map((s) => normalizeShoppingTitle(s.title)),
  );
  const source = items
    .filter((s) => s.status === "bought" || s.status === "rejected")
    .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  const seen = new Set<string>();
  const out: { id: string; title: string; assignee: MemberId; key: string; status: "bought" | "rejected" }[] = [];
  for (const s of source) {
    const k = normalizeShoppingTitle(s.title);
    if (openKeys.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push({
      id: s.id,
      title: s.title.trim() || s.title,
      assignee: s.assignee,
      key: k,
      status: s.status,
    });
  }
  return out;
}
