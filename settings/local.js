"use strict";

/**
 * Family Tasks overrides layered on top of `@fabric/hub/settings/local.js`.
 * Env still wins at runtime where documented (`PORT`, `FABRIC_HUB_PORT`, …).
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
