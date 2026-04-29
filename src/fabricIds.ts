/** Long-term persisted entity id: 64-char lowercase hex — same shape as Fabric {@link Actor#id}. */

export type FabricActorId = string;

export function newFabricEntityIdHex(): FabricActorId {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("") as FabricActorId;
}

export function isFabricActorId(value: unknown): value is FabricActorId {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
