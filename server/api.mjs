/**
 * API состояния + в продакшене раздача Vite-сборки.
 * Порт: PORT (по умолчанию 3000). Файл данных: DATA_DIR/app-state.json
 */
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const isProd = process.env.NODE_ENV === "production";
const dist = path.join(root, "dist");
const dataDir = process.env.DATA_DIR || path.join(root, "data");
const stateFile = path.join(dataDir, "app-state.json");
const appBase = (process.env.APP_BASE || "/components/dom-i-zadachi/").replace(/\/?$/, "/");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/api/state", (_req, res) => {
  try {
    if (!fs.existsSync(stateFile)) {
      return res.status(404).json({ error: "not_found" });
    }
    const raw = fs.readFileSync(stateFile, "utf8");
    res.type("application/json").send(raw);
  } catch {
    res.status(500).json({ error: "read_failed" });
  }
});

app.put("/api/state", (req, res) => {
  try {
    const body = req.body;
    if (!body || !Array.isArray(body.tasks) || !Array.isArray(body.shopping)) {
      return res.status(400).json({ error: "invalid" });
    }
    const out = {
      tasks: body.tasks,
      shopping: body.shopping,
      petCompletions: body.petCompletions && typeof body.petCompletions === "object" ? body.petCompletions : {},
    };
    fs.writeFileSync(stateFile, JSON.stringify(out), "utf8");
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "write_failed" });
  }
});

if (isProd) {
  const publicPath = appBase.replace(/\/$/, "");
  app.use(publicPath, express.static(dist));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) return next();
    if (!req.path.startsWith(publicPath)) return next();
    if (path.extname(req.path) !== "") return next();
    res.sendFile(path.join(dist, "index.html"));
  });
}

const port = Number(process.env.PORT) || 3000;
app.listen(port, "0.0.0.0", () => {
  const mode = isProd ? `static + API, base ${appBase}` : "API only (Vite в другом терминале / npm run dev)";
  console.log(`[dom-i-zadachi] http://0.0.0.0:${port} — ${mode}`);
  console.log(`[dom-i-zadachi] данные: ${stateFile}`);
});
