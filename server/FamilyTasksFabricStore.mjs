"use strict";

import path from "path";
import fs from "fs";

import { createRequire } from "module";

const require = createRequire(import.meta.url);
const Store = require("@fabric/core/types/store");
const Collection = require("@fabric/core/types/collection");
const pointer = require("json-pointer");

import { migrateDocumentToFabricIds } from "./fabricDocumentMigration.mjs";
import { repairFamilyDocument } from "./familyDocumentRepair.mjs";
import { allocateFabricEntityId, isFabricActorId } from "./fabricActorIdentity.mjs";

/** {@link Store#get} assumes metadata exists; use this for paths not yet written. */
async function safeContentGet(store, pathStr) {
  const route = await store.getRouteInfo(pathStr);
  const meta = store._state.metadata[route.index];
  if (!meta) return undefined;
  try {
    return pointer.get(store._state.content, route.path);
  } catch {
    return undefined;
  }
}

/**
 * LevelDB-backed {@link Store} for Family Tasks + {@link Collection} views for Fabric parity.
 * Canonical document JSON lives at {@link FamilyTasksFabricStore#documentPath}.
 */
export class FamilyTasksFabricStore extends Store {
  /**
   * @param {string} dataDir — `DATA_DIR` (contains `app-state.json` legacy + hub stores)
   * @param {object} [opts]
   */
  constructor(dataDir, opts = {}) {
    super({
      name: "@familytasks/store",
      path: path.join(dataDir, "fabric-family-tasks-store"),
      persistent: true,
      verbosity: Number(process.env.FABRIC_FAMILY_STORE_VERBOSITY ?? 0),
      ...opts,
    });

    this.dataDir = dataDir;
    this.legacyStateFile = path.join(dataDir, "app-state.json");
    this.documentPath = "/familytasks/document";

    this.usersCollection = new Collection({
      name: "FamilyTasksUser",
      key: "id",
      verbosity: 0,
    });
    this.tasksCollection = new Collection({
      name: "FamilyTasksTask",
      key: "id",
      verbosity: 0,
    });
    this.shoppingCollection = new Collection({
      name: "FamilyTasksShoppingItem",
      key: "id",
      verbosity: 0,
    });
  }

  /**
   * Mirror document arrays into Fabric {@link Collection} maps keyed by Actor id.
   * @param {Record<string, unknown>} doc
   */
  syncCollectionsFromDocument(doc) {
    try {
      const um = {};
      for (const u of doc.users || []) {
        if (u && typeof u === "object" && typeof u.id === "string") um[u.id] = u;
      }
      pointer.set(this.usersCollection.value, this.usersCollection.path, um);

      const tm = {};
      for (const t of doc.tasks || []) {
        if (t && typeof t === "object" && typeof t.id === "string") tm[t.id] = t;
      }
      pointer.set(this.tasksCollection.value, this.tasksCollection.path, tm);

      const sm = {};
      for (const s of doc.shopping || []) {
        if (s && typeof s === "object" && typeof s.id === "string") sm[s.id] = s;
      }
      pointer.set(this.shoppingCollection.value, this.shoppingCollection.path, sm);
    } catch (e) {
      console.warn("[family-tasks] syncCollectionsFromDocument:", e && e.message ? e.message : e);
    }
  }

  /**
   * Load merged document: Fabric Store → legacy JSON file fallback → factory default.
   * Runs Fabric Actor id migration when needed.
   * @param {() => Record<string, unknown>} createDefaultAppState
   */
  async loadApplicationDocument(createDefaultAppState) {
    if (!this.db) await this.open();

    let fromStore = await safeContentGet(this, this.documentPath);
    const hadStoreDoc = fromStore != null && typeof fromStore === "object";

    let doc = hadStoreDoc ? /** @type {Record<string, unknown>} */ (fromStore) : null;
    if (!doc) {
      if (fs.existsSync(this.legacyStateFile)) {
        try {
          const raw = JSON.parse(fs.readFileSync(this.legacyStateFile, "utf8"));
          doc = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : createDefaultAppState();
        } catch {
          doc = createDefaultAppState();
        }
      } else {
        doc = createDefaultAppState();
      }
    }

    const migrated = migrateDocumentToFabricIds(doc);
    doc = migrated.doc;
    const repaired = repairFamilyDocument(doc);
    doc = repaired.doc;
    if (migrated.changed || repaired.changed || !hadStoreDoc) {
      await this.persistApplicationDocument(doc);
    }

    return doc;
  }

  /** Persist canonical document + Collections + mirror JSON file for operators / migration. */
  async persistApplicationDocument(doc) {
    if (!this.db) await this.open();
    this.syncCollectionsFromDocument(doc);
    await this.set(this.documentPath, doc);
    try {
      fs.writeFileSync(this.legacyStateFile, JSON.stringify(doc), "utf8");
    } catch {
      /* noop */
    }
  }

  /** Server-side allocation for new family members — returns full user row with {@link Actor#id}. */
  allocateFamilyMemberRow(profile) {
    const { id } = allocateFabricEntityId("User");
    return {
      id,
      shortName: String(profile.shortName || "").trim(),
      fullName: String(profile.fullName || "").trim(),
      role: String(profile.role || "").trim(),
      color: /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(String(profile.color || "").trim())
        ? String(profile.color).trim()
        : "#7b9eb8",
    };
  }
}

export function validatePersistedDocument(doc) {
  if (!doc || typeof doc !== "object") return false;
  if (!Array.isArray(doc.tasks) || !Array.isArray(doc.shopping)) return false;
  if (doc.petCompletions != null && typeof doc.petCompletions !== "object") return false;

  const family = doc.family;
  const pending =
    family && typeof family === "object" && family.setupComplete === false;
  if (pending) {
    if (doc.tasks.length !== 0 || doc.shopping.length !== 0) return false;
    const users = doc.users;
    if (users !== undefined && (!Array.isArray(users) || users.length !== 0)) return false;
    return true;
  }

  if (!validateFabricUsers(doc.users)) return false;
  const userIds = new Set(doc.users.map((u) => u.id));
  for (const t of doc.tasks) {
    if (!t || typeof t !== "object") return false;
    const o = /** @type {Record<string, unknown>} */ (t);
    if (typeof o.id !== "string" || !isFabricActorId(o.id)) return false;
    if (typeof o.assignee !== "string" || !userIds.has(o.assignee)) return false;
    if (typeof o.title !== "string") return false;
    if (o.petId !== undefined && (typeof o.petId !== "string" || !isFabricActorId(o.petId))) return false;
    if (
      o.shoppingItemId !== undefined &&
      (typeof o.shoppingItemId !== "string" || !isFabricActorId(o.shoppingItemId))
    ) {
      return false;
    }
  }
  for (const s of doc.shopping) {
    if (!s || typeof s !== "object") return false;
    const o = /** @type {Record<string, unknown>} */ (s);
    if (typeof o.id !== "string" || !isFabricActorId(o.id)) return false;
    if (typeof o.assignee !== "string" || !userIds.has(o.assignee)) return false;
    if (typeof o.title !== "string") return false;
    if (typeof o.createdAt !== "string") return false;
    if (typeof o.status !== "string") return false;
  }
  if (doc.petCompletions != null && typeof doc.petCompletions !== "object") return false;
  return true;
}

export function validateFabricUsers(users) {
  if (!Array.isArray(users) || users.length === 0) return false;
  const ids = new Set();
  for (const u of users) {
    if (!u || typeof u !== "object") return false;
    const { id, shortName, fullName, role, color } = u;
    if (typeof id !== "string" || !isFabricActorId(id)) return false;
    if (typeof shortName !== "string" || typeof fullName !== "string" || typeof role !== "string") return false;
    if (typeof color !== "string" || !/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color.trim())) return false;
    if (ids.has(id)) return false;
    ids.add(id);
  }
  return true;
}
