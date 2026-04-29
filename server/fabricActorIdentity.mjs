"use strict";

/**
 * Fabric {@link Actor}-derived identifiers for Family Tasks entities.
 * IDs are {@link Actor#id}: 64-char hex from the Actor envelope (sorted-key generic message preimage).
 */

import crypto from "crypto";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const Actor = require("@fabric/core/types/actor");

/** True when `value` matches Fabric Actor id hex (SHA256 preimage pipeline output length). */
export function isFabricActorId(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

/** Deterministic nonce slice for migrations (stable across runs). */
export function deterministicNonce(kind, legacyKey) {
  return crypto.createHash("sha256").update(`FamilyTasks:${kind}:${legacyKey}`).digest("hex").slice(0, 32);
}

/**
 * Allocate a fresh Actor identity for a new entity (random nonce).
 * @param {string} kind — e.g. `User`, `Task`, `ShoppingItem`
 */
export function allocateFabricEntityId(kind) {
  const nonce = Actor.randomBytes(16).toString("hex");
  const actor = new Actor({
    type: `FamilyTasks/${kind}`,
    version: 1,
    nonce,
  });
  return { id: actor.id, nonce };
}

/** Deterministic Actor id for a legacy row (slug or old client id string). */
export function deterministicFabricEntityId(kind, legacyKey) {
  const nonce = deterministicNonce(kind, String(legacyKey));
  const actor = new Actor({
    type: `FamilyTasks/${kind}`,
    version: 1,
    nonce,
    legacyKey: String(legacyKey),
  });
  return actor.id;
}
