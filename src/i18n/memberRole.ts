import type { FamilyMember } from "../types";

/** Prefer `memberRoles.<id>` in i18n when present; otherwise show persisted `role`. */
export function memberRoleLabel(t: (path: string) => string, m: FamilyMember): string {
  const key = `memberRoles.${m.id}`;
  const label = t(key);
  if (label !== key) return label;
  return m.role;
}
