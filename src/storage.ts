import type { AppState, DayPhase, FamilyMember, FamilyState, PaymentProposal, TaskStatus } from "./types";
import { isFabricActorId } from "./fabricIds";

const DAY_PHASE_VALUES = new Set<string>(["morning", "day", "evening", "night", "sleep"]);

export interface PersistedState extends AppState {
  petCompletions: Record<string, TaskStatus>;
}

function parseUsers(raw: unknown): FamilyMember[] | null {
  if (raw === undefined) return null;
  if (!Array.isArray(raw)) return null;
  const out: FamilyMember[] = [];
  for (const u of raw) {
    if (!u || typeof u !== "object") return null;
    const o = u as Record<string, unknown>;
    if (typeof o.id !== "string" || !isFabricActorId(o.id)) return null;
    if (typeof o.shortName !== "string" || typeof o.fullName !== "string") return null;
    if (typeof o.role !== "string" || typeof o.color !== "string") return null;
    out.push({
      id: o.id,
      shortName: o.shortName,
      fullName: o.fullName,
      role: o.role,
      color: o.color,
    });
  }
  return out;
}

/** @returns undefined if key omitted (caller may infer), null if invalid */
function parseFamily(raw: unknown): FamilyState | null | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Record<string, unknown>;
  if (typeof f.setupComplete !== "boolean") return null;
  const out: FamilyState = { setupComplete: f.setupComplete };
  if (f.ownerUserId !== undefined) {
    if (typeof f.ownerUserId !== "string" || !isFabricActorId(f.ownerUserId)) return null;
    out.ownerUserId = f.ownerUserId;
  }
  if (f.displayName !== undefined) {
    if (typeof f.displayName !== "string") return null;
    out.displayName = f.displayName;
  }
  if (f.description !== undefined) {
    if (typeof f.description !== "string") return null;
    out.description = f.description;
  }
  if (f.setupCompletedAt !== undefined) {
    if (typeof f.setupCompletedAt !== "string") return null;
    out.setupCompletedAt = f.setupCompletedAt;
  }
  if (f.source !== undefined) {
    if (typeof f.source !== "string") return null;
    out.source = f.source;
  }
  if (f.fabricTasksPublic !== undefined) {
    if (typeof f.fabricTasksPublic !== "boolean") return null;
    out.fabricTasksPublic = f.fabricTasksPublic;
  }
  if (f.bitcoinFeatures !== undefined) {
    if (typeof f.bitcoinFeatures !== "boolean") return null;
    out.bitcoinFeatures = f.bitcoinFeatures;
  }
  if (f.shoppingVisiblePhasesAllTab !== undefined) {
    if (!Array.isArray(f.shoppingVisiblePhasesAllTab)) return null;
    const phases: DayPhase[] = [];
    for (const x of f.shoppingVisiblePhasesAllTab) {
      if (typeof x !== "string" || !DAY_PHASE_VALUES.has(x)) return null;
      phases.push(x as DayPhase);
    }
    out.shoppingVisiblePhasesAllTab = phases;
  }
  return out;
}

function parseTaskLike(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const t = raw as Record<string, unknown>;
  if (typeof t.id !== "string" || !isFabricActorId(t.id)) return false;
  if (typeof t.assignee !== "string" || !isFabricActorId(t.assignee)) return false;
  if (typeof t.title !== "string") return false;
  if (typeof t.slot !== "string") return false;
  if (typeof t.status !== "string") return false;
  if (t.petId !== undefined && (typeof t.petId !== "string" || !isFabricActorId(t.petId))) return false;
  if (t.shoppingItemId !== undefined && (typeof t.shoppingItemId !== "string" || !isFabricActorId(t.shoppingItemId))) {
    return false;
  }
  if (t.fabricPublished !== undefined && typeof t.fabricPublished !== "boolean") return false;
  return true;
}

function parseShoppingLike(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== "string" || !isFabricActorId(s.id)) return false;
  if (typeof s.assignee !== "string" || !isFabricActorId(s.assignee)) return false;
  if (typeof s.title !== "string") return false;
  if (typeof s.createdAt !== "string") return false;
  if (typeof s.status !== "string") return false;
  if (s.budgetSats !== undefined) {
    if (typeof s.budgetSats !== "number" || !Number.isFinite(s.budgetSats) || s.budgetSats < 0) return false;
  }
  return true;
}

/** @returns null if invalid */
function parsePaymentProposals(raw: unknown): PaymentProposal[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const out: PaymentProposal[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") return null;
    const o = x as Record<string, unknown>;
    if (o.type !== "PaymentProposal") return null;
    if (typeof o.id !== "string" || !isFabricActorId(o.id)) return null;
    if (typeof o.fromMemberId !== "string" || !isFabricActorId(o.fromMemberId)) return null;
    if (typeof o.amountSats !== "number" || !Number.isFinite(o.amountSats) || o.amountSats < 0) return null;
    if (typeof o.memo !== "string") return null;
    if (o.shoppingItemId !== undefined && (typeof o.shoppingItemId !== "string" || !isFabricActorId(o.shoppingItemId))) {
      return null;
    }
    if (o.status !== "pending" && o.status !== "approved" && o.status !== "rejected") return null;
    if (typeof o.createdAt !== "string") return null;
    if (o.decidedAt !== undefined && typeof o.decidedAt !== "string") return null;
    out.push({
      id: o.id,
      type: "PaymentProposal",
      fromMemberId: o.fromMemberId,
      amountSats: Math.floor(o.amountSats),
      memo: o.memo,
      ...(o.shoppingItemId ? { shoppingItemId: o.shoppingItemId } : {}),
      status: o.status,
      createdAt: o.createdAt,
      ...(o.decidedAt ? { decidedAt: o.decidedAt } : {}),
    });
  }
  return out;
}

/** Проверка тела ответа API / восстановленного JSON — все сущности с id в форме Fabric Actor. */
export function parsePersistedState(raw: unknown): PersistedState | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<PersistedState>;
  if (!Array.isArray(p.tasks) || !Array.isArray(p.shopping)) return null;
  for (const t of p.tasks) {
    if (!parseTaskLike(t)) return null;
  }
  for (const s of p.shopping) {
    if (!parseShoppingLike(s)) return null;
  }

  const familyParsed = parseFamily(p.family);
  if (familyParsed === null) return null;

  /** @type {FamilyState} */
  let family;
  if (familyParsed !== undefined) {
    family = familyParsed;
  } else if ((p.users?.length ?? 0) > 0) {
    family = { setupComplete: true };
  } else {
    family = { setupComplete: false };
  }

  const users = parseUsers(p.users);
  if (users === null && p.users !== undefined) return null;

  const paymentProposals = parsePaymentProposals(p.paymentProposals);
  if (paymentProposals === null) return null;

  if (users && users.length > 0) {
    const um = new Set(users.map((u) => u.id));
    for (const pr of paymentProposals) {
      if (!um.has(pr.fromMemberId)) return null;
    }
  }

  if (family.setupComplete === false) {
    const u = users ?? [];
    if (u.length !== 0) return null;
    if (p.tasks.length !== 0 || p.shopping.length !== 0) return null;
    if (paymentProposals.length !== 0) return null;
  }

  const base: PersistedState = {
    tasks: p.tasks,
    shopping: p.shopping,
    petCompletions: p.petCompletions && typeof p.petCompletions === "object" ? p.petCompletions : {},
    family,
    paymentProposals,
  };
  if (users && users.length > 0) {
    base.users = users;
  }
  return base;
}
