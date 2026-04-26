/**
 * Копирует Vite `dist/` в PersonalWebSite/assets/dom-i-zadachi
 * (ожидаемая структура: <workspace>/2st/dom-i-zadachi + <workspace>/PersonalWebSite).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, "../dist");
const target = process.env.PSITE_DOM_DIR
  ? path.resolve(process.env.PSITE_DOM_DIR)
  : path.join(__dirname, "../../../PersonalWebSite/components/dom-i-zadachi");

if (!fs.existsSync(dist)) {
  console.error("Нет папки dist. Сначала: npm run build:psite");
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.cpSync(dist, target, { recursive: true });
console.log("Скопировано в", target);
