#!/usr/bin/env node
"use strict";

/**
 * Download pinned Bitcoin Core + Core Lightning builds into a local prefix (no root required).
 *
 * Bitcoin Core — official binaries from bitcoincore.org (SHA256SUMS verified).
 * Core Lightning — Ubuntu (.deb-style tarball), Fedora (.rpm-style tarball), or Homebrew on macOS.
 *
 * Windows: Bitcoin Core yes; Core Lightning has no official native binaries on releases (ZIP is sources).
 *          Use WSL2 + Linux flow, Docker, or install CLN elsewhere.
 *
 * Env overrides:
 *   BITCOIN_CORE_VERSION   (default 28.3)
 *   CLN_VERSION            release tag e.g. v26.04.1
 *   INSTALL_PREFIX         output directory for bin/ + libexec/
 *   LIGHTNING_OFF          set to 1 to skip Core Lightning only
 */

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "..");

const BITCOIN_CORE_VERSION = process.env.BITCOIN_CORE_VERSION || "28.3";
const CLN_TAG = process.env.CLN_VERSION || "v26.04.1";

const BITCOIN_BASE = `https://bitcoincore.org/bin/bitcoin-core-${BITCOIN_CORE_VERSION}`;
const CLN_BASE = `https://github.com/ElementsProject/lightning/releases/download/${CLN_TAG}`;

const DEFAULT_PREFIX = path.join(PROJECT_ROOT, "tools", "chain-bin");

/** @typedef {{ dryRun: boolean, prefix: string, skipBitcoin: boolean, skipLightning: boolean, brewLightning: boolean, force: boolean }} CliOpts */

function parseArgs(argv) {
  /** @type {CliOpts} */
  const out = {
    dryRun: false,
    prefix: process.env.INSTALL_PREFIX || DEFAULT_PREFIX,
    skipBitcoin: false,
    skipLightning: process.env.LIGHTNING_OFF === "1",
    brewLightning: true,
    force: false,
  };
  for (const a of argv) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a.startsWith("--prefix=")) out.prefix = path.resolve(a.slice("--prefix=".length));
    else if (a === "--skip-bitcoin") out.skipBitcoin = true;
    else if (a === "--skip-lightning") out.skipLightning = true;
    else if (a === "--no-brew-lightning") out.brewLightning = false;
    else if (a === "--force") out.force = true;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/installBitcoinLightning.mjs [options]

Options:
  --prefix=DIR           Install binaries here (default: tools/chain-bin)
  --dry-run              Print URLs and actions only
  --skip-bitcoin         Only handle Core Lightning (where supported)
  --skip-lightning       Only handle Bitcoin Core
  --no-brew-lightning    On macOS, do not run Homebrew for lightning (prints hint instead)
  --force                Re-download even if outputs exist

Env: BITCOIN_CORE_VERSION, CLN_VERSION, INSTALL_PREFIX, LIGHTNING_OFF=1
`);
      process.exit(0);
    }
  }
  return out;
}

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * @param {string} sumsText
 * @param {string} archiveBasename
 */
function hashFromSums(sumsText, archiveBasename) {
  for (const line of sumsText.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const parts = t.split(/\s+/);
    if (parts.length < 2 || !/^[a-f0-9]{64}$/.test(parts[0])) continue;
    const name = parts[parts.length - 1];
    if (name === archiveBasename) return parts[0];
  }
  return null;
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return await res.text();
}

async function downloadFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  const ab = await res.arrayBuffer();
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(ab));
}

/** @returns {{ id?: string, idLike?: string }} */
function readLinuxOsRelease() {
  try {
    const raw = fs.readFileSync("/etc/os-release", "utf8");
    /** @type {{ id?: string, idLike?: string }} */
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = /^ID=(.+)$/.exec(line.trim());
      const ml = /^ID_LIKE=(.+)$/.exec(line.trim());
      if (m) out.id = m[1].replace(/^"|"$/g, "");
      if (ml) out.idLike = ml[1].replace(/^"|"$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

/** Fedora/RHEL-like vs Debian/Ubuntu-like */
function linuxRedHatFlavor() {
  const { id = "", idLike = "" } = readLinuxOsRelease();
  const hay = `${id} ${idLike}`.toLowerCase();
  return /\b(fedora|rhel|centos|rocky|almalinux|opensuse)\b/i.test(hay);
}

function bitcoinArchiveName(platform, arch) {
  const v = BITCOIN_CORE_VERSION;
  if (platform === "win32") {
    if (arch !== "x64") throw new Error("Bitcoin Core Windows builds are published for win64 (x64) only.");
    return `bitcoin-${v}-win64.zip`;
  }
  if (platform === "darwin") {
    if (arch === "arm64") return `bitcoin-${v}-arm64-apple-darwin.tar.gz`;
    return `bitcoin-${v}-x86_64-apple-darwin.tar.gz`;
  }
  if (platform === "linux") {
    if (arch === "arm64") return `bitcoin-${v}-aarch64-linux-gnu.tar.gz`;
    return `bitcoin-${v}-x86_64-linux-gnu.tar.gz`;
  }
  throw new Error(`Unsupported OS for Bitcoin Core download: ${platform} ${arch}`);
}

/**
 * @returns {{ name: string, kind: 'ubuntu' | 'fedora' } | null}
 */
function clnLinuxAsset() {
  const verLabel = CLN_TAG.startsWith("v") ? CLN_TAG : `v${CLN_TAG}`;
  if (linuxRedHatFlavor()) {
    return { name: `clightning-${verLabel}-Fedora-40-amd64.tar.gz`, kind: "fedora" };
  }
  return { name: `clightning-${verLabel}-Ubuntu-24.04-amd64.tar.xz`, kind: "ubuntu" };
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  return r;
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function ensureExecutable(file) {
  try {
    const st = fs.statSync(file);
    fs.chmodSync(file, st.mode | 0o111);
  } catch {
    /* noop */
  }
}

function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

/**
 * Extract bitcoin tarball / zip into prefix/bin (bitcoind, bitcoin-cli).
 * @param {string} archivePath
 * @param {string} platform
 * @param {string} binDir
 */
function installBitcoinFromArchive(archivePath, platform, binDir) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "btc-core-"));
  try {
    if (platform === "win32") {
      const ex = run("tar", ["-xf", archivePath, "-C", tmp]);
      if (ex.status !== 0) throw new Error(`extract zip: ${ex.stderr || ex.stdout}`);
    } else {
      const ex = run("tar", ["-xzf", archivePath, "-C", tmp]);
      if (ex.status !== 0) throw new Error(`extract tarball: ${ex.stderr || ex.stdout}`);
    }
    const entries = fs.readdirSync(tmp);
    const root = entries.length === 1 ? path.join(tmp, entries[0]) : tmp;
    const srcBin = path.join(root, "bin");
    if (!fs.existsSync(srcBin)) throw new Error("bitcoin archive missing bin/");
    fs.mkdirSync(binDir, { recursive: true });
    for (const name of ["bitcoind", "bitcoin-cli", "bitcoind.exe", "bitcoin-cli.exe"]) {
      const p = path.join(srcBin, name);
      if (fs.existsSync(p)) {
        const dest = path.join(binDir, path.basename(p));
        fs.copyFileSync(p, dest);
        ensureExecutable(dest);
      }
    }
  } finally {
    rmrf(tmp);
  }
}

/**
 * Copy lightningd + lightning-cli + libexec/c-lightning from extracted tar roots.
 * @param {string} extractRoot
 * @param {string} prefix
 */
function installLightningTreeIntoPrefix(extractRoot, prefix) {
  const binDir = path.join(prefix, "bin");
  const libDest = path.join(prefix, "libexec", "c-lightning");
  fs.mkdirSync(binDir, { recursive: true });

  let lightningdPath = "";
  function walk(dir) {
    const names = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of names) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.name === "lightningd" || ent.name === "lightningd.exe") lightningdPath = full;
    }
  }
  walk(extractRoot);
  if (!lightningdPath) throw new Error("Could not find lightningd in Core Lightning archive.");

  const binSrcDir = path.dirname(lightningdPath);
  fs.mkdirSync(binDir, { recursive: true });
  for (const n of ["lightningd", "lightning-cli", "lightningd.exe", "lightning-cli.exe"]) {
    const p = path.join(binSrcDir, n);
    if (fs.existsSync(p)) {
      const dest = path.join(binDir, n);
      fs.copyFileSync(p, dest);
      ensureExecutable(dest);
    }
  }

  /** Find .../libexec/c-lightning */
  let libSrc = "";
  function walkLib(dir) {
    const names = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of names) {
      const full = path.join(dir, ent.name);
      if (!ent.isDirectory()) continue;
      if (ent.name === "c-lightning" && dir.endsWith(`${path.sep}libexec`)) {
        libSrc = full;
        return;
      }
      walkLib(full);
    }
  }
  walkLib(extractRoot);
  if (!libSrc || !fs.existsSync(libSrc)) throw new Error("Could not find libexec/c-lightning in Core Lightning archive.");

  rmrf(libDest);
  fs.mkdirSync(path.dirname(libDest), { recursive: true });
  copyTree(libSrc, libDest);
}

function installLightningTarball(archivePath, platform, prefix) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cln-"));
  try {
    const lower = archivePath.toLowerCase();
    let ex;
    if (lower.endsWith(".tar.xz")) ex = run("tar", ["-xJf", archivePath, "-C", tmp]);
    else if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) ex = run("tar", ["-xzf", archivePath, "-C", tmp]);
    else throw new Error(`Unknown archive type: ${archivePath}`);
    if (ex.status !== 0) throw new Error(ex.stderr || ex.stdout || "tar failed");

    installLightningTreeIntoPrefix(tmp, prefix);
  } finally {
    rmrf(tmp);
  }
}

function installDarwinLightningWithBrew(opts) {
  const which = run("which", ["brew"]);
  if (which.status !== 0 || !which.stdout?.trim()) {
    console.warn("[install] Homebrew not found. Install Core Lightning with:\n  brew install core-lightning");
    return false;
  }
  const brew = which.stdout.trim();
  console.log("[install] Installing Core Lightning via Homebrew (official upstream bottles for macOS)…");
  if (opts.dryRun) {
    console.log(`  ${brew} install core-lightning`);
    return true;
  }
  const ins = run(brew, ["install", "core-lightning"], { stdio: "inherit" });
  if (ins.status !== 0) throw new Error("brew install core-lightning failed");
  console.log("[install] Verify:", spawnSync(brew, ["list", "--versions", "core-lightning"], { encoding: "utf8" }).stdout?.trim());
  return true;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const platform = process.platform;
  const arch = process.arch;

  const binDir = path.join(opts.prefix, "bin");
  const cacheDir = path.join(PROJECT_ROOT, "tools", ".chain-download-cache");
  fs.mkdirSync(cacheDir, { recursive: true });

  console.log(`[install] Bitcoin Core ${BITCOIN_CORE_VERSION} · Core Lightning ${CLN_TAG}`);
  console.log(`[install] Platform: ${platform} (${arch}) · Prefix: ${opts.prefix}`);

  /* ----- Bitcoin ----- */
  if (!opts.skipBitcoin) {
    const archiveName = bitcoinArchiveName(platform, arch);
    const sumsUrl = `${BITCOIN_BASE}/SHA256SUMS`;
    const archiveUrl = `${BITCOIN_BASE}/${archiveName}`;
    const archivePath = path.join(cacheDir, archiveName);

    if (!opts.dryRun && !opts.force && fs.existsSync(path.join(binDir, platform === "win32" ? "bitcoind.exe" : "bitcoind"))) {
      console.log("[install] Bitcoin Core binaries already present in prefix (--force to re-fetch)");
    } else {
      console.log("[install] Bitcoin:", archiveUrl);
      if (opts.dryRun) {
        console.log(`  fetch ${sumsUrl}`);
      } else {
        await downloadFile(sumsUrl, path.join(cacheDir, `SHA256SUMS-bitcoin-${BITCOIN_CORE_VERSION}`));
        const sumsText = fs.readFileSync(path.join(cacheDir, `SHA256SUMS-bitcoin-${BITCOIN_CORE_VERSION}`), "utf8");
        await downloadFile(archiveUrl, archivePath);
        const expected = hashFromSums(sumsText, archiveName);
        const actual = sha256File(archivePath);
        if (!expected) console.warn("[install] Warning: archive name not listed in SHA256SUMS (check manually)");
        else if (expected !== actual) throw new Error(`SHA256 mismatch for ${archiveName}`);
        installBitcoinFromArchive(archivePath, platform, binDir);
        console.log("[install] Installed bitcoind + bitcoin-cli →", binDir);
      }
    }
  }

  /* ----- Lightning ----- */
  if (opts.skipLightning) {
    console.log("[install] Skipping Core Lightning (--skip-lightning or LIGHTNING_OFF=1)");
    if (!opts.skipBitcoin && fs.existsSync(path.join(binDir, platform === "win32" ? "bitcoind.exe" : "bitcoind"))) {
      console.log("[install] Add to PATH:\n  export PATH=\"" + binDir + ":$PATH\"");
    }
    process.exit(0);
  }

  if (platform === "win32") {
    console.warn(
      "[install] Core Lightning does not publish native Windows binaries on GitHub releases (the .zip is source code).\n" +
        "          Options: install WSL2 and run this script on Linux, use Docker, or build from source.",
    );
    process.exit(opts.skipBitcoin ? 1 : 0);
  }

  if (platform === "darwin") {
    if (opts.brewLightning) {
      installDarwinLightningWithBrew(opts);
    } else {
      console.log("[install] macOS: install Core Lightning with Homebrew:\n  brew install core-lightning");
    }
    console.log("[install] Done.");
    process.exit(0);
  }

  if (platform !== "linux") {
    console.warn(`[install] Unsupported OS ${platform} for bundled Core Lightning installer`);
    process.exit(1);
  }

  if (arch !== "x64") {
    console.warn(
      "[install] Core Lightning official Linux binaries are amd64-only in current releases.\n" +
        "          Build from source or use an aarch64 community package.",
    );
    process.exit(opts.skipBitcoin ? 1 : 0);
  }

  const asset = clnLinuxAsset();
  const sumsUrl = `${CLN_BASE}/SHA256SUMS-${CLN_TAG}`;
  const archiveUrl = `${CLN_BASE}/${asset.name}`;
  const archivePath = path.join(cacheDir, asset.name);

  console.log("[install] Core Lightning:", archiveUrl);
  if (opts.dryRun) {
    console.log(`  fetch ${sumsUrl}`);
    process.exit(0);
  }

  await downloadFile(sumsUrl, path.join(cacheDir, `SHA256SUMS-${CLN_TAG}`));
  const sumsName = `SHA256SUMS-${CLN_TAG}`;
  let sumsText = fs.readFileSync(path.join(cacheDir, sumsName), "utf8");

  await downloadFile(archiveUrl, archivePath);

  let expected = hashFromSums(sumsText, asset.name);
  if (!expected) {
    const lines = sumsText.split(/\r?\n/).filter(Boolean);
    const hit = lines.find((ln) => ln.includes(asset.name));
    if (hit) {
      const parts = hit.trim().split(/\s+/);
      expected = parts[0];
    }
  }
  const actual = sha256File(archivePath);
  if (expected && expected !== actual) throw new Error(`SHA256 mismatch for ${asset.name}`);
  if (!expected) console.warn("[install] Warning: could not verify SHA256 from SHA256SUMS file");

  installLightningTarball(archivePath, platform, opts.prefix);
  console.log("[install] Installed lightningd + lightning-cli + plugins →", opts.prefix);
  console.log("[install] Add to PATH:\n  export PATH=\"" + binDir + ":$PATH\"");
  console.log("[install] Done.");
}

main().catch((err) => {
  console.error("[install] Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
