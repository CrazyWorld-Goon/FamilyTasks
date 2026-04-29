"use strict";

/**
 * Signed owner envelope using the node's Fabric {@link Key} (Schnorr / BIP340 via Key#sign).
 */

import crypto from "crypto";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const _sortKeys = require("@fabric/core/functions/_sortKeys");

/**
 * Canonical JSON — stable serialization for signing / verification.
 * @param {object} obj
 */
export function canonicalJsonString(obj) {
  return JSON.stringify(_sortKeys(obj));
}

/**
 * @param {*} key — {@link Key} with private signing capability
 * @param {object} payload — cloned with sorted keys
 * @returns {{ version: number, algorithm: string, issuer: string, payload: object, signerPublicHex: string, signatureHex: string, messageSha256Hex: string }}
 */
export function signFabricOwnerEnvelope(key, payload) {
  const sorted = /** @type {object} */ (_sortKeys({ ...payload }));
  const message = canonicalJsonString(sorted);
  const messageSha256Hex = crypto.createHash("sha256").update(message, "utf8").digest("hex");
  const sig = key.sign(message);
  const signatureHex = Buffer.isBuffer(sig) ? sig.toString("hex") : String(sig);

  return {
    version: 1,
    algorithm: "secp256k1-schnorr-bip340-sha256-message",
    issuer: "FamilyTasks",
    payload: sorted,
    signerPublicHex: key.pubkey,
    signatureHex,
    messageSha256Hex,
  };
}
