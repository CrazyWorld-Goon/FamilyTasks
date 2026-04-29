import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppI18nError } from "./appError";
import { MESSAGES, type Locale } from "./dicts";
import { translate } from "./translate";

const STORAGE_KEY = "familyTasks.locale";

const I18nContext = createContext<{
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (path: string, vars?: Record<string, string | number>) => string;
  formatAppError: (e: AppI18nError) => string;
} | null>(null);

function detectLocale(): Locale {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "en" || raw === "ru") return raw;
  } catch {
    // ignore
  }
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("ru")) return "ru";
  return "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() =>
    typeof window !== "undefined" ? detectLocale() : "en",
  );

  useEffect(() => {
    document.documentElement.lang = locale === "ru" ? "ru" : "en";
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // ignore
    }
  }, []);

  const t = useCallback(
    (path: string, vars?: Record<string, string | number>) => translate(MESSAGES[locale], path, vars),
    [locale],
  );

  const formatAppError = useCallback(
    (e: AppI18nError) => translate(MESSAGES[locale], e.key, e.values),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, formatAppError }),
    [locale, setLocale, t, formatAppError],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
