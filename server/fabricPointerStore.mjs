"use strict";

/**
 * Fabric-style document store: GET / PUT / DELETE over RFC 6901 JSON Pointer paths,
 * backed by a single JSON file (same shape as the Family Tasks app-state document).
 */

import fs from "fs";
import path from "path";
import jp from "json-pointer";

import { migrateDocumentToFabricIds } from "./fabricDocumentMigration.mjs";

function cloneJSON(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * @param {unknown} raw
 * @param {() => Record<string, unknown>} defaultFactory
 */
export function migrateStateDocument(raw, defaultFactory) {
  let doc =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? /** @type {Record<string, unknown>} */ (raw)
      : defaultFactory();

  if (!Array.isArray(doc.tasks)) doc.tasks = [];
  if (!Array.isArray(doc.shopping)) doc.shopping = [];
  if (!doc.petCompletions || typeof doc.petCompletions !== "object") doc.petCompletions = {};

  doc = migrateDocumentToFabricIds(doc).doc;

  const setupPending = doc.family && typeof doc.family === "object" && doc.family.setupComplete === false;
  if ((!Array.isArray(doc.users) || doc.users.length === 0) && !setupPending) {
    doc.users = cloneJSON(defaultFactory().users);
    doc = migrateDocumentToFabricIds(doc).doc;
  }

  return doc;
}

/**
 * @param {Record<string, unknown>} doc
 * @param {string} ptr
 */
export function fabricGET(doc, ptr) {
  const p = !ptr || ptr === "" ? "/" : ptr.startsWith("/") ? ptr : `/${ptr}`;
  if (p === "/") return cloneJSON(doc);
  try {
    return jp.get(doc, p);
  } catch {
    return undefined;
  }
}

/**
 * @param {Record<string, unknown>} doc
 * @param {string} ptr
 * @param {unknown} value
 */
export function fabricPUT(doc, ptr, value) {
  const p = !ptr || ptr === "" ? "/" : ptr.startsWith("/") ? ptr : `/${ptr}`;
  if (p === "/") {
    return value && typeof value === "object" && !Array.isArray(value)
      ? /** @type {Record<string, unknown>} */ (cloneJSON(value))
      : {};
  }
  jp.set(doc, p, value);
  return doc;
}

/**
 * @param {Record<string, unknown>} doc
 * @param {string} ptr
 */
export function fabricDELETE(doc, ptr) {
  const p = !ptr || ptr === "" ? "/" : ptr.startsWith("/") ? ptr : `/${ptr}`;
  if (p === "/") {
    return {};
  }
  try {
    jp.remove(doc, p);
  } catch {
    /* already missing */
  }
  return doc;
}

/**
 * @param {string} filePath
 * @param {() => Record<string, unknown>} defaultFactory
 */
export function loadStateDocument(filePath, defaultFactory) {
  if (!fs.existsSync(filePath)) {
    const fresh = defaultFactory();
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(fresh), "utf8");
    return fresh;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const doc = migrateStateDocument(raw, defaultFactory);
    fs.writeFileSync(filePath, JSON.stringify(doc), "utf8");
    return doc;
  } catch {
    const fresh = defaultFactory();
    fs.writeFileSync(filePath, JSON.stringify(fresh), "utf8");
    return fresh;
  }
}

export function saveStateDocument(filePath, doc) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(doc), "utf8");
}
