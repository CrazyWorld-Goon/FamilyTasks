"use strict";

/**
 * Family Tasks overrides layered on top of `@fabric/hub/settings/local.js`.
 * Env still wins at runtime where documented (`PORT`, `FABRIC_HUB_PORT`, …).
 *
 * CommonJS file (`.cjs`) because the repo uses `"type": "module"` — a `.js` file here would be
 * parsed as ESM and `module.exports` would fail to load.
 *
 * @type {{
 *   name?: string,
 *   title?: string,
 *   http?: { port?: number, hostname?: string, interface?: string },
 * }}
 */
module.exports = {
  name: "Family Tasks",
  // Keep Family Tasks off Hub defaults to avoid collisions with sibling services.
  // Runtime env still wins in `server/api.mjs`:
  // FABRIC_HUB_PORT / PORT, FABRIC_PORT, FABRIC_BITCOIN_RPC_PORT, FABRIC_LIGHTNING_PORT.
  port: 39777,
  http: {
    port: 3900,
  },
  bitcoin: {
    rpcport: 39443,
  },
  lightning: {
    port: 29735,
  },
};
