"use strict";

/**
 * Hub `settings.federations[]` entry — one logical household per Family Tasks node.
 * Seeded into `federations/REGISTRY` via `@fabric/hub/functions/federationRegistry.seedRegistryFromSettings`.
 */

module.exports = {
  id: "familytasks-household",
  name: "Family Tasks household",
  kind: "familytasks-household",
  networkId: "this node",
  description:
    "Exactly one household identity for this Family Tasks process. First-time setup names the home and records the owner; member list is the collaboration surface.",
  links: [
    { label: "Family Tasks", href: "/" },
    { label: "Federation registry (JSON)", href: "/services/distributed/federation-registry" },
  ],
};
