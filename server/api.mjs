"use strict";

/**
 * Fabric Hub (`@fabric/hub/services/hub`) + Family Tasks REST (`GET|PUT /api/state`, JSON Pointer `GET|PUT|DELETE /api/store`).
 * HTTP/WebSocket surface matches Hub defaults (WebRTC signaling over WS + `/services/rpc`).
 *
 * Env: PORT / FABRIC_HUB_PORT — HTTP listener (Hub `settings.http.port`).
 *      FABRIC_BITCOIN_ENABLE=false — skip Bitcoin (recommended for local dev).
 *      DATA_DIR — app JSON + Fabric hub stores under `${DATA_DIR}/fabric-hub/`.
 *      NODE_ENV=production — recommended for `npm start`; required for missing-dist warning.
 *      FABRIC_APP_BASE — Vite build base (default `/` in vite.config); must match how `dist/` was built.
 *      HUB_STOCK_UI=1 — leave Hub’s default `/` shell (skip Family Tasks wiring).
 *      FABRIC_PUBLIC_HUB_ORIGIN — origin for forwarding `POST /api/public-faucet` to the public Hub (default https://hub.fabric.pub).
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
import {
  fabricDELETE,
  fabricGET,
  fabricPUT,
  migrateStateDocument,
} from "./fabricPointerStore.mjs";
import {
  FamilyTasksFabricStore,
  validatePersistedDocument,
} from "./FamilyTasksFabricStore.mjs";
import { migrateDocumentToFabricIds } from "./fabricDocumentMigration.mjs";
import { createDefaultAppState } from "./defaultAppState.mjs";
import { getOrCreateNodeMasterKey, readNodeMasterKeyMeta } from "./fabricNodeMasterKey.mjs";
import { signFabricOwnerEnvelope } from "./fabricOwnerToken.mjs";
import { isFabricActorId } from "./fabricActorIdentity.mjs";
import { mountBitcoinPriceRoute } from "./fabricPriceRates.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

ensureFabricDocumentOfferEnvelope(root);

const require = createRequire(import.meta.url);
const merge = require("lodash.merge");
const familyFederationRef = require(path.join(root, "contracts/familyFederation.cjs"));
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
/** Single JSON document: tasks, shopping, petCompletions, users — Fabric-style pointer access via `/api/store`. */
let fabricStore;
/** @type {Record<string, unknown>} */
let stateDoc;

async function bootstrapState() {
  fabricStore = new FamilyTasksFabricStore(dataDir);
  stateDoc = await fabricStore.loadApplicationDocument(createDefaultAppState);
  getOrCreateNodeMasterKey(dataDir);
}

async function persistState() {
  await fabricStore.persistApplicationDocument(stateDoc);
}
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

  const baseFeds = Array.isArray(mergedBase.federations) ? mergedBase.federations : [];
  const federationList = [...baseFeds];
  const famId = familyFederationRef.id;
  if (!federationList.some((f) => f && f.id === famId)) {
    federationList.push(familyFederationRef);
  }

  return merge({}, mergedBase, {
    federations: federationList,
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
  hub.http._addRoute("get", "/api/state", (_req, res) => {
    try {
      res.type("application/json").send(JSON.stringify(stateDoc));
    } catch {
      res.status(500).json({ error: "read_failed" });
    }
  });

  hub.http._addRoute("put", "/api/state", async (req, res) => {
    try {
      const body = req.body;
      if (!body || !Array.isArray(body.tasks) || !Array.isArray(body.shopping)) {
        return res.status(400).json({ error: "invalid" });
      }
      let next = {
        ...stateDoc,
        tasks: body.tasks,
        shopping: body.shopping,
        petCompletions: body.petCompletions && typeof body.petCompletions === "object" ? body.petCompletions : {},
      };
      if (body.users !== undefined) {
        next.users = body.users;
      }
      if (body.family !== undefined) {
        next.family = body.family;
      }
      next = migrateDocumentToFabricIds(next).doc;
      if (!validatePersistedDocument(next)) {
        return res.status(400).json({ error: "invalid_document" });
      }
      stateDoc = next;
      await persistState();
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "write_failed" });
    }
  });

  /** JSON Pointer read (RFC 6901). Query: `path` — default `/` for full document. */
  hub.http._addRoute("get", "/api/store", (req, res) => {
    try {
      const raw = req.query && req.query.path !== undefined ? String(req.query.path) : "/";
      const ptr = raw === "" ? "/" : raw.startsWith("/") ? raw : `/${raw}`;
      const data = fabricGET(stateDoc, ptr);
      res.json({ path: ptr, data });
    } catch (e) {
      res.status(500).json({ error: String(e && e.message ? e.message : e) });
    }
  });

  /** JSON Pointer write. Body: `{ "path": "/users", "value": [...] }` — use `path` `/` to replace entire document (validated + migrated). */
  hub.http._addRoute("put", "/api/store", async (req, res) => {
    try {
      const body = req.body;
      if (!body || typeof body.path !== "string") {
        return res.status(400).json({ error: "invalid" });
      }
      const ptr = body.path === "" ? "/" : body.path.startsWith("/") ? body.path : `/${body.path}`;
      if (ptr === "/") {
        stateDoc = migrateStateDocument(body.value, createDefaultAppState);
        if (!validatePersistedDocument(stateDoc)) {
          return res.status(400).json({ error: "invalid_document" });
        }
      } else {
        fabricPUT(stateDoc, ptr, body.value);
        stateDoc = migrateDocumentToFabricIds(stateDoc).doc;
        if (!validatePersistedDocument(stateDoc)) {
          return res.status(400).json({ error: "invalid_document" });
        }
      }
      await persistState();
      res.json({ ok: true, path: ptr, data: fabricGET(stateDoc, ptr) });
    } catch (e) {
      res.status(400).json({ error: String(e && e.message ? e.message : e) });
    }
  });

  hub.http._addRoute("delete", "/api/store", async (req, res) => {
    try {
      const raw = req.query && req.query.path !== undefined ? String(req.query.path) : "";
      const ptr = raw === "" ? "/" : raw.startsWith("/") ? raw : `/${raw}`;
      if (ptr === "/") {
        return res.status(400).json({ error: "root_delete_not_allowed" });
      }
      fabricDELETE(stateDoc, ptr);
      stateDoc = migrateDocumentToFabricIds(stateDoc).doc;
      if (!validatePersistedDocument(stateDoc)) {
        return res.status(400).json({ error: "invalid_document" });
      }
      await persistState();
      res.json({ ok: true, path: ptr });
    } catch (e) {
      res.status(400).json({ error: String(e && e.message ? e.message : e) });
    }
  });
}

function mountFabricEndpoints(hub) {
  hub.http._addRoute("get", "/api/fabric/node-key", (_req, res) => {
    try {
      const meta = readNodeMasterKeyMeta(dataDir);
      let publicKeyHex = meta?.publicKeyHex || "";
      if (!publicKeyHex) {
        const k = getOrCreateNodeMasterKey(dataDir);
        publicKeyHex = k.pubkey;
      }
      if (!publicKeyHex) {
        return res.status(503).json({ error: "master_key_unavailable" });
      }
      res.json({
        publicKeyHex,
        createdAt: meta?.createdAt ?? null,
        kind: "FamilyTasks/NodeMasterKey",
      });
    } catch (e) {
      res.status(500).json({ error: String(e && e.message ? e.message : e) });
    }
  });

  hub.http._addRoute("post", "/api/fabric/issue-owner-token", (req, res) => {
    try {
      const body = req.body || {};
      const userId = typeof body.userId === "string" ? body.userId.trim() : "";
      if (!userId || !isFabricActorId(userId)) {
        return res.status(400).json({ error: "invalid_user_id" });
      }
      if (!stateDoc.family || typeof stateDoc.family !== "object" || stateDoc.family.setupComplete !== true) {
        return res.status(409).json({ error: "family_not_ready" });
      }
      const users = Array.isArray(stateDoc.users) ? stateDoc.users : [];
      const user = users.find((u) => u && typeof u === "object" && u.id === userId);
      if (!user) {
        return res.status(404).json({ error: "user_not_found" });
      }
      const ownerUserId = typeof stateDoc.family.ownerUserId === "string" ? stateDoc.family.ownerUserId : "";
      if (ownerUserId && ownerUserId !== userId) {
        return res.status(403).json({ error: "not_owner" });
      }
      const masterKey = getOrCreateNodeMasterKey(dataDir);
      const payload = {
        type: "FamilyTasks/OwnerToken",
        version: 1,
        userId: user.id,
        userShortName: typeof user.shortName === "string" ? user.shortName : "",
        familyDisplayName: typeof stateDoc.family.displayName === "string" ? stateDoc.family.displayName : "",
        familyOwnerUserId: ownerUserId || userId,
        issuedAt: new Date().toISOString(),
      };
      const envelope = signFabricOwnerEnvelope(masterKey, payload);
      res.json(envelope);
    } catch (e) {
      console.error("[family-tasks] issue-owner-token:", e);
      res.status(500).json({ error: "issue_failed" });
    }
  });
}

/** Forwards faucet requests so the SPA can avoid browser CORS to hub.fabric.pub. */
function mountPublicFabricFaucetProxy(hub) {
  const DEFAULT_ORIGIN = "https://hub.fabric.pub";
  hub.http._addRoute("post", "/api/public-faucet", async (req, res) => {
    try {
      const base = String(process.env.FABRIC_PUBLIC_HUB_ORIGIN || DEFAULT_ORIGIN).replace(/\/$/, "");
      const upstream = `${base}/services/bitcoin/faucet`;
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const address = String(body.address || body.to || "").trim();
      let amountSats = Number(body.amountSats != null ? body.amountSats : NaN);
      if (!Number.isFinite(amountSats) || amountSats <= 0) amountSats = 10000;
      amountSats = Math.round(amountSats);

      const upstreamRes = await fetch(upstream, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ address, amountSats }),
      });

      const text = await upstreamRes.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        return res
          .status(upstreamRes.status >= 400 ? upstreamRes.status : 502)
          .json({
            status: "error",
            message: "public_hub_response_not_json",
            snippet: text.slice(0, 240),
          });
      }

      res.status(upstreamRes.status).json(json);
    } catch (e) {
      res.status(502).json({
        status: "error",
        message: e && e.message ? String(e.message) : "public_faucet_forward_failed",
      });
    }
  });
}

class FamilyTasksHub extends Hub {
  constructor(settings) {
    super(settings);
    mountAppStateRoutes(this);
    mountFabricEndpoints(this);
    mountBitcoinPriceRoute(this);
    mountPublicFabricFaucetProxy(this);
  }
}

async function main() {
  const settings = buildHubSettings();
  if (Object.keys(familySettingsLocal).length > 0) {
    console.log("[family-tasks] Merged ./settings/local.cjs into Hub defaults.");
  }
  await bootstrapState();
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
  console.log("[family-tasks] Fabric endpoints: GET /api/fabric/node-key · POST /api/fabric/issue-owner-token · GET /api/price/btc · POST /api/public-faucet");
}

main().catch((err) => {
  console.error("[family-tasks] Failed to start:", err && err.stack ? err.stack : err);
  process.exit(1);
});
