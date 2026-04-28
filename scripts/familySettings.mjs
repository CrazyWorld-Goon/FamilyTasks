"use strict";

/**
 * Loads repo-root `settings/local.js` (CommonJS) for merging into Hub defaults.
 */

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);

export function familyProjectRoot() {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
}

/** @returns {Record<string, unknown>} */
export function loadFamilySettingsLocal() {
  const root = familyProjectRoot();
  const settingsPath = path.join(root, "settings", "local.js");
  if (!fs.existsSync(settingsPath)) return {};
  try {
    return require(settingsPath);
  } catch (err) {
    const msg = err && typeof err === "object" && "message" in err ? String(err.message) : String(err);
    console.warn(`[family-tasks] Failed to load settings/local.js (${settingsPath}): ${msg}`);
    return {};
  }
}
