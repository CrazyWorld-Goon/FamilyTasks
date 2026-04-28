"use strict";

import { deterministicFabricEntityId } from "./fabricActorIdentity.mjs";

/** Deterministic demo household — same ids as `src/constants.ts` DEFAULT_MEMBERS / legacy clients. */
export function legacyDemoUsers() {
  return [
    {
      id: deterministicFabricEntityId("User", "anya"),
      shortName: "Аня",
      fullName: "Аня",
      role: "Мама",
      color: "#c56c86",
    },
    {
      id: deterministicFabricEntityId("User", "seryozha"),
      shortName: "Серёжа",
      fullName: "Серёжа",
      role: "Мужик",
      color: "#6b8f71",
    },
    {
      id: deterministicFabricEntityId("User", "tamara"),
      shortName: "Тамара",
      fullName: "Тамара",
      role: "Дочь",
      color: "#7b9eb8",
    },
    {
      id: deterministicFabricEntityId("User", "luka"),
      shortName: "Лука",
      fullName: "Лука",
      role: "Сын",
      color: "#d4a574",
    },
  ];
}

/** Fresh node: no users until first-time setup; matches {@link ensureFamilyMetadata} pending shape. */

export function createDefaultAppState() {
  return {
    tasks: [],
    shopping: [],
    petCompletions: {},
    users: [],
    family: {
      setupComplete: false,
    },
  };
}
