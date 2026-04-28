/** Публичные файлы из `public/`: учёт `import.meta.env.BASE_URL` (см. vite.config base). */
export function publicAsset(path: string): string {
  const p = path.replace(/^\/+/, "");
  const base = import.meta.env.BASE_URL;
  if (base.endsWith("/")) return `${base}${p}`;
  return `${base}/${p}`;
}
