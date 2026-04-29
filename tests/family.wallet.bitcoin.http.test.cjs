"use strict";

/**
 * Family Wallet — Hub `/services/bitcoin` HTTP behavior (admin-gated spend / broadcast / mining).
 *
 * Uses a disposable DATA_DIR and `FABRIC_BITCOIN_ENABLE=false` so no bitcoind is required.
 * Verifies:
 *   - Public status surface (`GET /services/bitcoin`)
 *   - Wallet RPC returns unavailable when Bitcoin is off
 *   - Hub wallet spend (`POST /services/bitcoin/payments` and `POST /payments`) requires admin token in body
 *   - Broadcast + regtest block generation require `Authorization: Bearer <admin token>`
 *   - Valid admin token passes the gate but stops at `503` when Bitcoin is disabled
 *
 * Env:
 *   SKIP_FAMILY_WALLET_HTTP=1 — skip suite
 */

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");

function describeWallet(title, fn) {
  return process.env.SKIP_FAMILY_WALLET_HTTP === "1" ? describe.skip(title, fn) : describe(title, fn);
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

async function findFreePort(startPort = 30300, maxAttempts = 40) {
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

/**
 * @param {string} baseUrl e.g. http://127.0.0.1:8080/
 * @param {string} method
 * @param {string} reqPath path + query
 * @param {{ body?: object, bearer?: string, headers?: Record<string,string> }} [opts]
 */
function requestJson(baseUrl, method, reqPath, opts = {}) {
  const { body, bearer, headers: extra = {} } = opts;
  const payload = body !== undefined ? JSON.stringify(body) : undefined;
  const u = new URL(reqPath.replace(/^\//, ""), baseUrl);
  return new Promise((resolve, reject) => {
    const reqOpts = {
      method,
      hostname: u.hostname,
      port: u.port,
      path: `${u.pathname}${u.search}`,
      headers: {
        Accept: "application/json",
        ...(payload !== undefined
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {}),
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        ...extra,
      },
    };
    const req = http.request(reqOpts, (res) => {
      let data = "";
      res.on("data", (c) => {
        data += c;
      });
      res.on("end", () => {
        let json = null;
        try {
          json = data ? JSON.parse(data) : null;
        } catch (_) {
          /* leave json null */
        }
        resolve({ status: res.statusCode || 0, json, text: data });
      });
    });
    req.on("error", reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

describeWallet("Family Wallet — /services/bitcoin (HTTP)", function () {
  this.timeout(120000);

  let serverProcess;
  let httpPort;
  let fabricPort;
  let baseUrl;
  let dataDir;
  let adminToken = "";

  before(async function () {
    httpPort = await findFreePort(30320);
    fabricPort = await findFreePort(40320);
    baseUrl = `http://127.0.0.1:${httpPort}/`;
    dataDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "familytasks-wallet-test-"));

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
        DATA_DIR: dataDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    serverProcess.stderr?.on("data", (d) => process.stderr.write(`[wallet-test-api] ${d}`));
    serverProcess.stdout?.on("data", (d) => process.stdout.write(`[wallet-test-api] ${d}`));

    await waitForHttp(baseUrl, 120000);

    const settingsRes = await requestJson(baseUrl, "GET", "/settings");
    assert.strictEqual(settingsRes.status, 200, `GET /settings: ${settingsRes.text}`);
    const st = settingsRes.json;
    assert.ok(st && typeof st === "object", "settings JSON");

    if (st.needsSetup && !st.configured) {
      const boot = await requestJson(baseUrl, "POST", "/settings", {
        body: {
          NODE_NAME: "FamilyWalletTestHub",
          NODE_PERSONALITY: JSON.stringify(["helpful"]),
          NODE_TEMPERATURE: 0,
          NODE_GOALS: JSON.stringify([]),
          BITCOIN_NETWORK: "regtest",
          BITCOIN_MANAGED: false,
          BITCOIN_HOST: "127.0.0.1",
          BITCOIN_RPC_PORT: "18443",
          BITCOIN_USERNAME: "",
          BITCOIN_PASSWORD: "",
          LIGHTNING_MANAGED: false,
          LIGHTNING_SOCKET: "",
          DISK_ALLOCATION_MB: 64,
          COST_PER_BYTE_SATS: 0.01,
        },
      });
      assert.strictEqual(boot.status, 200, `bootstrap: ${boot.text}`);
      assert.ok(boot.json && typeof boot.json.token === "string" && boot.json.token.length > 0, "admin token");
      adminToken = boot.json.token;
    } else {
      // Re-run against an already-configured store is not expected with mkdtemp; skip token-dependent asserts
      adminToken = "";
    }
  });

  after(async function () {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 500));
      try {
        serverProcess.kill("SIGKILL");
      } catch (_) {
        /* noop */
      }
    }
    try {
      if (dataDir && fs.existsSync(dataDir)) {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    } catch (_) {
      /* noop */
    }
  });

  it("GET /services/bitcoin returns JSON status (200)", async function () {
    const r = await requestJson(baseUrl, "GET", "/services/bitcoin");
    assert.strictEqual(r.status, 200, r.text);
    assert.ok(r.json && typeof r.json === "object", "body object");
    assert.ok("available" in r.json || "balance" in r.json || "status" in r.json, "expected status fields");
  });

  it("GET /services/bitcoin/wallets responds 503 when Bitcoin integration is off", async function () {
    const r = await requestJson(baseUrl, "GET", "/services/bitcoin/wallets");
    assert.strictEqual(r.status, 503, r.text);
    assert.ok(
      r.json && (String(r.json.message || "").includes("unavailable") || r.json.status === "error"),
      "unavailable message",
    );
  });

  it("POST /services/bitcoin/payments without admin token returns 403", async function () {
    const r = await requestJson(baseUrl, "POST", "/services/bitcoin/payments", {
      body: { to: "bcrt1qtest", amountSats: 1000 },
    });
    assert.strictEqual(r.status, 403, r.text);
    assert.ok(
      r.json && String(r.json.message || "").toLowerCase().includes("admin"),
      `expected admin message, got ${r.text}`,
    );
  });

  it("POST /payments without admin token returns 403 (canonical spend path)", async function () {
    const r = await requestJson(baseUrl, "POST", "/payments", {
      body: { to: "bcrt1qtest", amountSats: 1000 },
    });
    assert.strictEqual(r.status, 403, r.text);
    assert.ok(r.json && String(r.json.message || "").toLowerCase().includes("admin"), r.text);
  });

  it("POST /services/bitcoin/payments with bogus adminToken still returns 403", async function () {
    const r = await requestJson(baseUrl, "POST", "/services/bitcoin/payments", {
      body: { adminToken: "not-a-real-token", to: "bcrt1qtest", amountSats: 1000 },
    });
    assert.strictEqual(r.status, 403, r.text);
  });

  it("POST /services/bitcoin/broadcast without Bearer returns 401", async function () {
    const r = await requestJson(baseUrl, "POST", "/services/bitcoin/broadcast", {
      body: { hex: "00" },
    });
    assert.strictEqual(r.status, 401, r.text);
    assert.ok(r.json && String(r.json.message || "").toLowerCase().includes("admin"), r.text);
  });

  it("POST /services/bitcoin/blocks without Bearer returns 401 (regtest mining)", async function () {
    const r = await requestJson(baseUrl, "POST", "/services/bitcoin/blocks", {
      body: { count: 1 },
    });
    assert.strictEqual(r.status, 401, r.text);
  });

  it("with valid admin token, POST /services/bitcoin/payments reaches Bitcoin service and returns 503 when off", async function () {
    if (!adminToken) {
      this.skip();
    }
    const r = await requestJson(baseUrl, "POST", "/services/bitcoin/payments", {
      body: {
        adminToken,
        to: "bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080",
        amountSats: 1000,
      },
    });
    assert.strictEqual(r.status, 503, r.text);
    assert.ok(r.json && String(r.json.message || "").toLowerCase().includes("unavailable"), r.text);
  });

  it("with valid admin Bearer, POST /services/bitcoin/broadcast returns 503 when Bitcoin is off", async function () {
    if (!adminToken) {
      this.skip();
    }
    const r = await requestJson(baseUrl, "POST", "/services/bitcoin/broadcast", {
      bearer: adminToken,
      body: { hex: "01000000000100" },
    });
    assert.strictEqual(r.status, 503, r.text);
  });
});
