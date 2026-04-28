export type Messages = Record<string, unknown>;

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? ""));
}

export function lookup(messages: Messages, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = messages;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in cur) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

export function translate(messages: Messages, path: string, vars?: Record<string, string | number>): string {
  const raw = lookup(messages, path);
  if (typeof raw !== "string") return path;
  return interpolate(raw, vars);
}
