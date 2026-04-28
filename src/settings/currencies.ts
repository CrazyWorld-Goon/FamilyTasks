"use strict";

/**
 * Reference fiat display for BTC-denominated hub balances (Fabric uses BTC/sats everywhere).
 */
export type FiatCurrencyCode = "USD" | "RUB";

export const FIAT_CURRENCIES: readonly FiatCurrencyCode[] = ["USD", "RUB"] as const;

export const DEFAULT_FIAT_CURRENCY: FiatCurrencyCode = "USD";

export const FIAT_CURRENCY_STORAGE_KEY = "familyTasks.fiatCurrency";

/** Legacy mixed BTC/fiat picker; migrated when reading fiat preference */
export const LEGACY_DISPLAY_CURRENCY_KEY = "familyTasks.displayCurrency";

/** Dispatched after `FIAT_CURRENCY_STORAGE_KEY` changes (same-tab sync for header ticker, etc.) */
export const FIAT_CURRENCY_CHANGED_EVENT = "familytasks:fiat-currency";

export function isFiatCurrencyCode(v: string): v is FiatCurrencyCode {
  return (FIAT_CURRENCIES as readonly string[]).includes(v);
}

export function readStoredFiatCurrency(): FiatCurrencyCode {
  if (typeof window === "undefined") return DEFAULT_FIAT_CURRENCY;
  try {
    const raw = window.localStorage.getItem(FIAT_CURRENCY_STORAGE_KEY);
    if (raw && isFiatCurrencyCode(raw)) return raw;

    const legacy = window.localStorage.getItem(LEGACY_DISPLAY_CURRENCY_KEY);
    if (legacy && isFiatCurrencyCode(legacy)) return legacy;
    if (legacy === "BTC") return DEFAULT_FIAT_CURRENCY;
  } catch {
    // ignore
  }
  return DEFAULT_FIAT_CURRENCY;
}

export function broadcastFiatCurrencyChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(FIAT_CURRENCY_CHANGED_EVENT));
}

export function subscribeFiatCurrencyChanged(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(FIAT_CURRENCY_CHANGED_EVENT, handler);
  return () => window.removeEventListener(FIAT_CURRENCY_CHANGED_EVENT, handler);
}
