/** Structured error for UI translation via `t(error.key, error.values)`. */
export type AppI18nError = {
  key: string;
  values?: Record<string, string | number>;
};
