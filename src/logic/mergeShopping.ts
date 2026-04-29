import type { ShoppingItem } from "../types";

/**
 * Слияние списка покупок при ответе сервера. Локально отмеченное «куплено» не затирается
 * устаревшим `open` с сервера (сценарий: покупки без сети, потом синхронизация).
 * Если с сервера пришла покупка, а локально ещё `open` — берём сервер.
 */
export function mergeShoppingWithServer(local: ShoppingItem[], server: ShoppingItem[]): ShoppingItem[] {
  const byId = new Set<string>([...local.map((x) => x.id), ...server.map((x) => x.id)]);
  const lMap = new Map(local.map((x) => [x.id, x] as const));
  const sMap = new Map(server.map((x) => [x.id, x] as const));
  const out: ShoppingItem[] = [];
  for (const id of byId) {
    const li = lMap.get(id);
    const si = sMap.get(id);
    out.push(pickMerged(li, si));
  }
  return out;
}

/** Сравнение без учёта порядка строк. */
export function shoppingDataEqual(a: ShoppingItem[], b: ShoppingItem[]): boolean {
  if (a.length !== b.length) return false;
  const mb = new Map(b.map((x) => [x.id, x]));
  for (const x of a) {
    const y = mb.get(x.id);
    if (!y) return false;
    if (
      x.status !== y.status ||
      x.boughtAt !== y.boughtAt ||
      x.title !== y.title ||
      x.assignee !== y.assignee ||
      x.createdAt !== y.createdAt ||
      x.budgetSats !== y.budgetSats
    ) {
      return false;
    }
  }
  return true;
}

function pickMerged(li: ShoppingItem | undefined, si: ShoppingItem | undefined): ShoppingItem {
  if (li == null) return si!;
  if (si == null) return li;

  if (li.status === "rejected" && si.status !== "rejected") return li;
  if (si.status === "rejected" && li.status !== "rejected") return si;
  if (li.status === "rejected" && si.status === "rejected") return li;

  if (li.status === "bought" && si.status === "open") return li;
  if (li.status === "open" && si.status === "bought") return si;
  if (li.status === "bought" && si.status === "bought") {
    const da = li.boughtAt || "";
    const db = si.boughtAt || "";
    return da >= db ? li : si;
  }
  if (li.status === "open" && si.status === "open") {
    return {
      ...li,
      budgetSats: si.budgetSats ?? li.budgetSats,
      title: si.title,
      assignee: si.assignee,
      createdAt: si.createdAt,
    };
  }
  return li;
}
