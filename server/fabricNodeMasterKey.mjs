"use strict";

/**
 * One Fabric {@link Key} per Family Tasks process — node "master" signing key for owner tokens.
 * Persisted under `${DATA_DIR}/fabric-hub/` (same tree as Hub FS).
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const Key = require("@fabric/core/types/key");

const REL_PATH = path.join("fabric-hub", "familytasks-node-master-key.json");

/** @type {import('@fabric/core/types/key')|null} */
let cached = null;

/**
 * @param {string} dataDir — `DATA_DIR`
 */
export function getOrCreateNodeMasterKey(dataDir) {
  if (cached) return cached;
  const filePath = path.join(dataDir, REL_PATH);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  if (fs.existsSync(filePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (!raw || typeof raw !== "object" || typeof raw.xprv !== "string") {
        throw new Error("invalid_master_key_file");
      }
      cached = new Key({
        xprv: raw.xprv,
        network: raw.network === "main" || raw.network === "testnet" || raw.network === "regtest" ? raw.network : "regtest",
      });
      return cached;
    } catch (e) {
      console.error("[family-tasks] Failed to load node master key — creating new one:", e && e.message ? e.message : e);
    }
  }

  const key = new Key({ network: "regtest" });
  const out = {
    version: 1,
    network: key.settings?.network || "regtest",
    xprv: key.xprv,
    xpub: key.xpub,
    publicKeyHex: key.pubkey,
    createdAt: new Date().toISOString(),
    label: "FamilyTasks node master (BIP32 root; keep this file private)",
  };
  fs.writeFileSync(filePath, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    /* windows / unsupported */
  }
  console.log(`[family-tasks] Created new Fabric node master key at ${filePath}`);
  cached = key;
  return cached;
}

/**
 * @param {string} dataDir
 * @returns {{ publicKeyHex: string, createdAt?: string, path: string }|null}
 */
export function readNodeMasterKeyMeta(dataDir) {
  const filePath = path.join(dataDir, REL_PATH);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return {
      publicKeyHex: typeof raw.publicKeyHex === "string" ? raw.publicKeyHex : "",
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : undefined,
      path: filePath,
    };
  } catch {
    return null;
  }
}
