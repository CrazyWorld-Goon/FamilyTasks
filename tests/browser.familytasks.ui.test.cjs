"use strict";

/**
 * Browser smoke tests via `@fabric/http/types/sandbox` (Puppeteer), matching Hub’s browser tests.
 *
 * Prereqs:
 *   `npm run build` — production bundle served by `server/api.mjs`.
 *   Chrome for Puppeteer — once per machine or CI image: `npm run install:puppeteer-chrome`
 *   (or `npx puppeteer browsers install chrome`).
 *
 * Env:
 *   SKIP_BROWSER_UI=1 — skip suite (e.g. CI without Chrome).
 */

const assert = require("assert");
const http = require("http");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");

const Sandbox = require("@fabric/http/types/sandbox");

const DEFAULT_GOTO = { waitUntil: "load", timeout: 30000 };

function describeUi(title, fn) {
  return process.env.SKIP_BROWSER_UI === "1" ? describe.skip(title, fn) : describe(title, fn);
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => resolve(false));
    server.listen({ port, host: "127.0.0.1" }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findFreePort(startPort = 30200, maxAttempts = 40) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const port = startPort + i;
    if (await canListen(port)) return port;
  }
  throw new Error(`No free port starting at ${startPort}`);
}

function waitForHttp(url, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = () => {
      http
        .get(url, (res) => {
          res.resume();
          resolve();
        })
        .on("error", () => {
          if (Date.now() > deadline) return reject(new Error(`Timeout waiting for ${url}`));
          setTimeout(poll, 400);
        });
    };
    poll();
  });
}

describeUi("Family Tasks UI (sandbox)", function () {
  this.timeout(180000);

  let serverProcess;
  let httpPort;
  let fabricPort;
  let baseUrl;
  let sandbox;

  before(async function () {
    httpPort = await findFreePort(30210);
    fabricPort = await findFreePort(40210);

    baseUrl = `http://127.0.0.1:${httpPort}/`;

    const root = path.join(__dirname, "..");
    serverProcess = spawn(process.execPath, [path.join(root, "server", "api.mjs")], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(httpPort),
        FABRIC_HUB_PORT: String(httpPort),
        FABRIC_PORT: String(fabricPort),
        FABRIC_BITCOIN_ENABLE: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    serverProcess.stderr?.on("data", (d) => process.stderr.write(`[api] ${d}`));
    serverProcess.stdout?.on("data", (d) => process.stdout.write(`[api] ${d}`));

    await waitForHttp(baseUrl, 120000);

    sandbox = new Sandbox({
      browser: {
        headless: process.env.PUPPETEER_HEADLESS !== "false",
      },
    });
    await sandbox.start();
  });

  after(async function () {
    if (sandbox) {
      try {
        await sandbox.stop();
      } catch (_) {
        /* noop */
      }
    }
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 500));
      try {
        serverProcess.kill("SIGKILL");
      } catch (_) {
        /* noop */
      }
    }
  });

  it("serves the Family Tasks shell with brand heading", async function () {
    await sandbox.browser.goto(baseUrl, DEFAULT_GOTO);

    await sandbox.browser.waitForSelector(".app-shell", { timeout: 25000 });
    await sandbox.browser.waitForSelector(".brand h1", { timeout: 15000 });

    const heading = await sandbox.browser.$eval(".brand h1", (el) => el.textContent.trim());
    assert.ok(heading.length > 0, "brand heading should be visible");

    const title = await sandbox.browser.title();
    assert.ok(
      /home|task|дом|задач/i.test(title),
      `unexpected title: ${title}`,
    );
  });

  it("Network tab renders Fabric WebSocket panel copy", async function () {
    await sandbox.browser.goto(baseUrl, DEFAULT_GOTO);
    await sandbox.browser.waitForSelector(".app-shell", { timeout: 25000 });

    await sandbox.browser.evaluate(() => {
      const tabs = [...document.querySelectorAll('[role="tab"]')];
      const netTab = tabs.find((t) => /network/i.test(t.textContent || ""));
      if (netTab) netTab.click();
    });

    await sandbox.browser.waitForFunction(
      () => document.body.innerText.includes("Fabric Hub WebSocket"),
      { timeout: 15000 },
    );
  });
});
