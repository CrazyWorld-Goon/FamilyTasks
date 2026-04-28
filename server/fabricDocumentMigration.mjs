"use strict";

/**
 * Migrate persisted Family Tasks JSON to Fabric Actor ids for users, tasks, shopping, pets, and keys.
 */

import { deterministicFabricEntityId, isFabricActorId } from "./fabricActorIdentity.mjs";

function mapLegacyUserId(id, slugToFabric) {
  if (isFabricActorId(id)) return id;
  if (slugToFabric.has(id)) return slugToFabric.get(id);
  const fabric = deterministicFabricEntityId("User", id);
  slugToFabric.set(id, fabric);
  return fabric;
}

function mapLegacyPetId(id, slugToPetFabric) {
  if (isFabricActorId(id)) return id;
  if (slugToPetFabric.has(id)) return slugToPetFabric.get(id);
  const fabric = deterministicFabricEntityId("Pet", id);
  slugToPetFabric.set(id, fabric);
  return fabric;
}

function migratePetCompletionKeys(petCompletions, slugToPetFabric) {
  const out = {};
  let changed = false;
  const source = petCompletions && typeof petCompletions === "object" ? petCompletions : {};
  for (const [key, status] of Object.entries(source)) {
    const parts = key.split("|");
    if (parts.length !== 4) {
      out[key] = status;
      continue;
    }
    const [dateKey, petPart, kind, plannedMin] = parts;
    const petId = mapLegacyPetId(petPart, slugToPetFabric);
    if (petId !== petPart) changed = true;
    const newKey = `${dateKey}|${petId}|${kind}|${plannedMin}`;
    if (newKey !== key) changed = true;
    out[newKey] = status;
  }
  return { petCompletions: out, changed };
}

/**
 * @param {Record<string, unknown>} doc
 * @returns {{ doc: Record<string, unknown>, changed: boolean }}
 */
export function ensureFamilyMetadata(doc) {
  const hasFamily = doc.family && typeof doc.family === "object";
  if (hasFamily) {
    return { doc, changed: false };
  }
  const users = Array.isArray(doc.users) ? doc.users : [];
  let changed = true;
  /** @type {Record<string, unknown>} */
  const family =
    users.length > 0
      ? {
          setupComplete: true,
          ownerUserId:
            users[0] && typeof users[0] === "object" && typeof (/** @type {Record<string, unknown>} */ (users[0])).id === "string"
              ? String((/** @type {Record<string, unknown>} */ (users[0])).id)
              : "",
          displayName: "",
          setupCompletedAt: new Date().toISOString(),
          source: "legacy",
        }
      : {
          setupComplete: false,
        };
  return {
    doc: { ...doc, family },
    changed,
  };
}

/**
 * @param {Record<string, unknown>} doc
 * @returns {{ doc: Record<string, unknown>, changed: boolean }}
 */
export function migrateDocumentToFabricIds(doc) {
  let changed = false;
  const slugToFabric = new Map();
  const slugToPetFabric = new Map();

  const users = Array.isArray(doc.users) ? [...doc.users] : [];
  const nextUsers = users.map((u) => {
    if (!u || typeof u !== "object") return u;
    const o = /** @type {Record<string, unknown>} */ (u);
    const oldId = typeof o.id === "string" ? o.id : "";
    if (!oldId || isFabricActorId(oldId)) return u;
    const nid = mapLegacyUserId(oldId, slugToFabric);
    if (nid !== oldId) changed = true;
    return { ...u, id: nid };
  });

  const tasks = Array.isArray(doc.tasks) ? [...doc.tasks] : [];
  const nextTasks = tasks.map((t) => {
    if (!t || typeof t !== "object") return t;
    const o = /** @type {Record<string, unknown>} */ (t);
    let nt = { ...t };
    const tid = typeof o.id === "string" ? o.id : "";
    if (tid && !isFabricActorId(tid)) {
      nt = { ...nt, id: deterministicFabricEntityId("Task", tid) };
      changed = true;
    }
    const asn = typeof o.assignee === "string" ? o.assignee : "";
    if (asn && !isFabricActorId(asn)) {
      nt = { ...nt, assignee: mapLegacyUserId(asn, slugToFabric) };
      changed = true;
    }
    const pref = typeof o.petId === "string" ? o.petId : "";
    if (pref && !isFabricActorId(pref)) {
      const np = mapLegacyPetId(pref, slugToPetFabric);
      nt = { ...nt, petId: np };
      if (np !== pref) changed = true;
    }
    const sref = typeof o.shoppingItemId === "string" ? o.shoppingItemId : "";
    if (sref && !isFabricActorId(sref)) {
      nt = { ...nt, shoppingItemId: deterministicFabricEntityId("ShoppingItem", sref) };
      changed = true;
    }
    return nt;
  });

  const shopping = Array.isArray(doc.shopping) ? [...doc.shopping] : [];
  const nextShopping = shopping.map((s) => {
    if (!s || typeof s !== "object") return s;
    const o = /** @type {Record<string, unknown>} */ (s);
    let ns = { ...s };
    const sid = typeof o.id === "string" ? o.id : "";
    if (sid && !isFabricActorId(sid)) {
      ns = { ...ns, id: deterministicFabricEntityId("ShoppingItem", sid) };
      changed = true;
    }
    const asn = typeof o.assignee === "string" ? o.assignee : "";
    if (asn && !isFabricActorId(asn)) {
      ns = { ...ns, assignee: mapLegacyUserId(asn, slugToFabric) };
      changed = true;
    }
    return ns;
  });

  const pcIn =
    doc.petCompletions && typeof doc.petCompletions === "object" ? doc.petCompletions : {};
  const migratedPc = migratePetCompletionKeys(pcIn, slugToPetFabric);
  if (migratedPc.changed) changed = true;

  const out = {
    ...doc,
    users: nextUsers,
    tasks: nextTasks,
    shopping: nextShopping,
    petCompletions: migratedPc.petCompletions,
  };
  const fam = ensureFamilyMetadata(out);
  let finalDoc = fam.doc;
  let finalChanged = changed || fam.changed;
  return { doc: finalDoc, changed: finalChanged };
}
