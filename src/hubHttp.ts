/**
 * Hub HTTP origin (same convention as {@link import("./components/FabricNetwork").default} address rules).
 */
export function getHubHttpOrigin(): string {
  const fromEnv = import.meta.env.VITE_HUB_ADDRESS?.trim();
  if (fromEnv) {
    const raw = fromEnv.includes("://") ? fromEnv : `http://${fromEnv}`;
    try {
      const u = new URL(raw);
      return `${u.protocol}//${u.host}`.replace(/\/$/, "");
    } catch {
      return "";
    }
  }
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.host}`.replace(/\/$/, "");
  }
  return "";
}

export function hubUrl(path: string): string {
  const origin = getHubHttpOrigin();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${p}`;
}

/** Default {@code https://hub.fabric.pub} unless {@code import.meta.env.VITE_PUBLIC_FABRIC_HUB_ORIGIN} is set (no trailing slash). */
export function getPublicFabricHubOrigin(): string {
  const raw = import.meta.env.VITE_PUBLIC_FABRIC_HUB_ORIGIN?.trim();
  if (!raw) return "https://hub.fabric.pub";
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return `${u.protocol}//${u.host}`.replace(/\/$/, "");
  } catch {
    return "https://hub.fabric.pub";
  }
}

/** Hub JSON transaction view on the public Fabric Hub. */
export function publicFabricHubBitcoinTxUrl(txid: string): string {
  const origin = getPublicFabricHubOrigin();
  const id = txid.trim().toLowerCase().replace(/\s+/g, "");
  if (!/^[0-9a-f]{64}$/.test(id)) {
    return `${origin}/services/bitcoin/transactions`;
  }
  return `${origin}/services/bitcoin/transactions/${encodeURIComponent(id)}`;
}
