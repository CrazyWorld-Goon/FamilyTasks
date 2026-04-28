"use strict";

/**
 * Some installs omit `functions/fabricDocumentOfferEnvelope.js` while Fabric packages still require it.
 * Copy into `@fabric/core` and/or `@fabric/hub` from `FABRIC_HUB_ROOT`, a sibling hub checkout,
 * or `vendor/fabricDocumentOfferEnvelope.js` bundled with FamilyTasks.
 *
 * Lookup order:
 * 1. `$FABRIC_HUB_ROOT/functions/fabricDocumentOfferEnvelope.js`
 * 2. `<projectRoot>/../hub.fabric.pub/functions/...` (sibling checkout)
 * 3. `<projectRoot>/vendor/fabricDocumentOfferEnvelope.js` (bundled — no extra clone)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

function resolveSrc(projectRoot) {
  const candidates = [
    process.env.FABRIC_HUB_ROOT && path.join(process.env.FABRIC_HUB_ROOT, "functions", "fabricDocumentOfferEnvelope.js"),
    path.join(projectRoot, "..", "hub.fabric.pub", "functions", "fabricDocumentOfferEnvelope.js"),
    path.join(projectRoot, "vendor", "fabricDocumentOfferEnvelope.js"),
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * @param {string} projectRoot - directory that contains `node_modules/@fabric/core` (and `@fabric/hub`)
 * @param {{ throwIfMissing?: boolean }} [opts]
 */
export function ensureFabricDocumentOfferEnvelope(projectRoot, opts = {}) {
  const throwIfMissing = opts.throwIfMissing !== false;

  const coreDest = path.join(projectRoot, "node_modules", "@fabric", "core", "functions", "fabricDocumentOfferEnvelope.js");
  const hubDest = path.join(projectRoot, "node_modules", "@fabric", "hub", "functions", "fabricDocumentOfferEnvelope.js");

  const needCore = !fs.existsSync(coreDest);
  const needHub = !fs.existsSync(hubDest);

  if (!needCore && !needHub) return;

  const src = resolveSrc(projectRoot);
  if (!src) {
    const msg =
      "Missing fabricDocumentOfferEnvelope.js for @fabric/core and/or @fabric/hub and no bundled vendor copy — " +
      "restore FamilyTasks/vendor/fabricDocumentOfferEnvelope.js, clone hub.fabric.pub beside this repo " +
      "(../hub.fabric.pub), or set FABRIC_HUB_ROOT, then run: node scripts/ensureFabricCoreEnvelope.mjs";
    if (throwIfMissing) {
      throw new Error(`[family-tasks] ${msg}`);
    }
    console.warn(`[family-tasks] ${msg}`);
    return;
  }

  if (needCore) {
    fs.mkdirSync(path.dirname(coreDest), { recursive: true });
    fs.copyFileSync(src, coreDest);
    console.log(`[family-tasks] Patched @fabric/core: copied fabricDocumentOfferEnvelope.js from ${src}`);
  }
  if (needHub) {
    fs.mkdirSync(path.dirname(hubDest), { recursive: true });
    fs.copyFileSync(src, hubDest);
    console.log(`[family-tasks] Patched @fabric/hub: copied fabricDocumentOfferEnvelope.js from ${src}`);
  }
}

const __filename = fileURLToPath(import.meta.url);
if (path.resolve(process.argv[1] || "") === path.resolve(__filename)) {
  ensureFabricDocumentOfferEnvelope(path.join(SCRIPT_DIR, ".."), { throwIfMissing: false });
}
