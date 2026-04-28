"use strict";

/**
 * Fabric Hub (`@fabric/hub/services/hub`) + Family Tasks REST (`GET|PUT /api/state`).
 * HTTP/WebSocket surface matches Hub defaults (WebRTC signaling over WS + `/services/rpc`).
 *
 * Env: PORT / FABRIC_HUB_PORT — HTTP listener (Hub `settings.http.port`).
 *      FABRIC_BITCOIN_ENABLE=false — skip Bitcoin (recommended for local dev).
 *      DATA_DIR — app JSON + Fabric hub stores under `${DATA_DIR}/fabric-hub/`.
 *      NODE_ENV=production — recommended for `npm start`; required for missing-dist warning.
 *      FABRIC_APP_BASE — Vite build base (default `/` in vite.config); must match how `dist/` was built.
 *      HUB_STOCK_UI=1 — leave Hub’s default `/` shell (skip Family Tasks wiring).
 *      FABRIC_HUB_ROOT — optional path to hub.fabric.pub (see scripts/ensureFabricCoreEnvelope.mjs).
 *      `./settings/local.cjs` — Family Tasks overrides merged after `@fabric/hub/settings/local.js`
 *      (`http.port`, `name`, …); env `PORT` / `FABRIC_HUB_PORT` still wins when set.
 *      FAMILY_TASKS_DEV_HTTP_PORT — optional dev-runner-only preferred API port (defaults to `./settings/local.cjs` http.port).
 */

import fs from "fs";
import path from "path";
import process from "process";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { ensureFabricDocumentOfferEnvelope } from "../scripts/ensureFabricCoreEnvelope.mjs";
import { loadFamilySettingsLocal } from "../scripts/familySettings.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

ensureFabricDocumentOfferEnvelope(root);

const require = createRequire(import.meta.url);
const merge = require("lodash.merge");
const Hub = require("@fabric/hub");
const hubMainPath = require.resolve("@fabric/hub");
const hubPackageRoot = path.join(path.dirname(hubMainPath), "..");
const hubSettingsLocal = require(path.join(hubPackageRoot, "settings", "local.js"));
const familySettingsLocal = loadFamilySettingsLocal();
const isProd = process.env.NODE_ENV === "production";
const dist = path.join(root, "dist");
const dataDir = process.env.DATA_DIR || path.join(root, "data");
const hubDataRoot = path.join(dataDir, "fabric-hub");
const stateFile = path.join(dataDir, "app-state.json");
/** Public URL prefix for logs (should match FABRIC_APP_BASE used at build time). */
const appBase = (process.env.APP_BASE || process.env.FABRIC_APP_BASE || "/").replace(/\/?$/, "/");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(hubDataRoot)) {
  fs.mkdirSync(hubDataRoot, { recursive: true });
}

function coercePort(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function buildHubSettings() {
  const mergedBase = merge({}, hubSettingsLocal, familySettingsLocal);
  const envHttpPort = process.env.FABRIC_HUB_PORT || process.env.PORT;
  const httpPort = coercePort(envHttpPort, coercePort(mergedBase.http?.port, 8080));

  return merge({}, mergedBase, {
    title: mergedBase.title || mergedBase.name || hubSettingsLocal.title,
    path: path.join(hubDataRoot, "hub"),
    fs: {
      ...(mergedBase.fs || {}),
      path: path.join(hubDataRoot, "fs"),
    },
    peersDb: path.join(hubDataRoot, "peers"),
    http: {
      ...(mergedBase.http || {}),
      hostname:
        process.env.FABRIC_HUB_HOSTNAME || mergedBase.http?.hostname || hubSettingsLocal.http?.hostname || "0.0.0.0",
      interface:
        process.env.FABRIC_HUB_INTERFACE || mergedBase.http?.interface || hubSettingsLocal.http?.interface || "0.0.0.0",
      port: httpPort,
    },
  });
}

/**
 * Hub’s HTTP stack defaults to Hub assets + `_handleIndexRequest` → Fabric SPA (`this.app.render`).
 * We point Fabric’s static root at `dist/` and replace `_handleIndexRequest` **before** `http.start()`
 * registers GET `/`, so `/` always serves Family Tasks when `dist/index.html` exists.
 *
 * Set `HUB_STOCK_UI=1` to skip (stock Hub HTML at `/`).
 */
function configureFamilyTasksUi(hub) {
  if (process.env.HUB_STOCK_UI === "1") return;

  const indexHtml = path.join(dist, "index.html");
  if (!fs.existsSync(indexHtml)) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[family-tasks] No dist/index.html — run `npm run build` first. `/` will use the stock Hub shell until then.",
      );
    }
    return;
  }

  const distAbs = path.resolve(dist);
  hub.http.settings.assets = distAbs;
  hub.http.settings.path = distAbs;

  const body = fs.readFileSync(indexHtml, "utf8");
  hub.http._handleIndexRequest = function familyTasksIndex(_req, res) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(body);
  };

  try {
    if (typeof hub.http.setApplicationHtml === "function") {
      hub.http.setApplicationHtml(body);
    }
  } catch {
    // optional HTML shell for JSON/HTML negotiation
  }

  console.log(`[family-tasks] Serving Family Tasks UI from ${distAbs} (GET / → dist/index.html)`);
}

function mountAppStateRoutes(hub) {
  hub.http._addRoute("get", "/api/state", (req, res) => {
    try {
      if (!fs.existsSync(stateFile)) {
        return res.status(404).json({ error: "not_found" });
      }
      const raw = fs.readFileSync(stateFile, "utf8");
      res.type("application/json").send(raw);
    } catch {
      res.status(500).json({ error: "read_failed" });
    }
  });

  hub.http._addRoute("put", "/api/state", (req, res) => {
    try {
      const body = req.body;
      if (!body || !Array.isArray(body.tasks) || !Array.isArray(body.shopping)) {
        return res.status(400).json({ error: "invalid" });
      }
      const out = {
        tasks: body.tasks,
        shopping: body.shopping,
        petCompletions: body.petCompletions && typeof body.petCompletions === "object" ? body.petCompletions : {},
      };
      fs.writeFileSync(stateFile, JSON.stringify(out), "utf8");
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "write_failed" });
    }
  });
}

class FamilyTasksHub extends Hub {
  constructor(settings) {
    super(settings);
    mountAppStateRoutes(this);
  }
}

async function main() {
  const settings = buildHubSettings();
  if (Object.keys(familySettingsLocal).length > 0) {
    console.log("[family-tasks] Merged ./settings/local.cjs into Hub defaults.");
  }
  const hub = new FamilyTasksHub(settings);
  configureFamilyTasksUi(hub);

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[family-tasks] ${signal} — stopping Hub…`);
    try {
      await hub.stop();
    } catch (e) {
      console.warn("[family-tasks] Hub stop:", e && e.message ? e.message : e);
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await hub.start();

  const port = hub.settings?.http?.port ?? hub.http?.settings?.port ?? settings.http.port;
  const bindHost = settings.http.interface === "0.0.0.0" ? "127.0.0.1" : settings.http.hostname || "localhost";
  const mode = isProd
    ? `production · Family Tasks SPA at / (dist → Hub HTTP assets root) · base ${appBase}`
    : "development · Hub (Vite uses another port; proxy /api)";
  const displayName = settings.name || settings.title || hubSettingsLocal.title || "Family Tasks";
  console.log(`[family-tasks] ${displayName} · Fabric Hub listening · http://${bindHost}:${port} (bind ${settings.http.interface}:${port})`);
  console.log(`[family-tasks] ${mode}`);
  console.log(`[family-tasks] App state file: ${stateFile}`);
  console.log(`[family-tasks] Hub store: ${hubDataRoot}`);
}

main().catch((err) => {
  console.error("[family-tasks] Failed to start:", err && err.stack ? err.stack : err);
  process.exit(1);
});
