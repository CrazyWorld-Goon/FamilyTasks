"use strict";

/**
 * Heal inconsistent documents (e.g. empty `users` while tasks/shopping reference assignees,
 * or `family.setupComplete: false` together with saved activity). Production loads must pass
 * client {@link parsePersistedState} after repair.
 */

import { isFabricActorId } from "./fabricActorIdentity.mjs";
import { legacyDemoUsers } from "./defaultAppState.mjs";

/**
 * @param {Record<string, unknown>} doc
 * @returns {{ doc: Record<string, unknown>, changed: boolean }}
 */
export function repairFamilyDocument(doc) {
  let changed = false;

  const tasks = Array.isArray(doc.tasks) ? doc.tasks : [];
  const shopping = Array.isArray(doc.shopping) ? doc.shopping : [];

  const neededIds = new Set();
  for (const t of tasks) {
    if (!t || typeof t !== "object") continue;
    const a = /** @type {Record<string, unknown>} */ (t).assignee;
    if (typeof a === "string" && isFabricActorId(a)) neededIds.add(a);
  }
  for (const s of shopping) {
    if (!s || typeof s !== "object") continue;
    const a = /** @type {Record<string, unknown>} */ (s).assignee;
    if (typeof a === "string" && isFabricActorId(a)) neededIds.add(a);
  }

  const pool = legacyDemoUsers();
  const poolById = new Map(pool.map((u) => [u.id, u]));

  const byId = new Map();
  const initialUsers = Array.isArray(doc.users) ? doc.users : [];
  for (const u of initialUsers) {
    if (u && typeof u === "object" && typeof /** @type {{ id?: string }} */ (u).id === "string") {
      byId.set(/** @type {{ id: string }} */ (u).id, u);
    }
  }

  if (neededIds.size > 0) {
    for (const id of neededIds) {
      if (!byId.has(id)) {
        const row = poolById.get(id);
        if (row) {
          byId.set(id, row);
          changed = true;
        }
      }
    }
  }

  let users = [...byId.values()];
  if (neededIds.size > 0) {
    const covered = [...neededIds].every((id) => users.some((u) => u && u.id === id));
    if (!covered || users.length === 0) {
      const matched = pool.filter((u) => neededIds.has(u.id));
      users = matched.length > 0 ? matched : [...pool];
      changed = true;
    }
  }

  /** @type {Record<string, unknown>} */
  let family =
    doc.family && typeof doc.family === "object"
      ? { .../** @type {Record<string, unknown>} */ (doc.family) }
      : {};

  const pending = family.setupComplete === false;
  const hasUsers = users.length > 0;
  const hasActivity = tasks.length > 0 || shopping.length > 0;

  if (pending && (hasActivity || hasUsers)) {
    family.setupComplete = true;
    if (!family.setupCompletedAt || typeof family.setupCompletedAt !== "string") {
      family.setupCompletedAt = new Date().toISOString();
    }
    if (!family.source || typeof family.source !== "string") {
      family.source = "repair_pending_with_activity";
    }
    if ((!family.ownerUserId || typeof family.ownerUserId !== "string") && hasUsers) {
      family.ownerUserId = /** @type {{ id: string }} */ (users[0]).id;
    }
    changed = true;
  }

  return {
    doc: {
      ...doc,
      users,
      family,
      tasks,
      shopping,
    },
    changed,
  };
}
