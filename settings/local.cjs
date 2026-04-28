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
  http: {
    port: 3900,
  },
};
