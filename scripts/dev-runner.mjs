import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { ensureFabricDocumentOfferEnvelope } from "./ensureFabricCoreEnvelope.mjs";
import { loadFamilySettingsLocal } from "./familySettings.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

ensureFabricDocumentOfferEnvelope(root);

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => resolve(false));
    server.listen({ port, host: "127.0.0.1" }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findFreePort(startPort, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const port = startPort + i;
    // eslint-disable-next-line no-await-in-loop
    if (await canListen(port)) return port;
  }
  throw new Error(`Не удалось найти свободный порт, начиная с ${startPort}`);
}

function spawnProcess(command, args, env) {
  return spawn(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
    shell: false,
  });
}

async function main() {
  const familyLocal = loadFamilySettingsLocal();
  const fromEnv = process.env.FAMILY_TASKS_DEV_HTTP_PORT;
  const fromSettings = familyLocal.http?.port;
  const preferredApiPort =
    Number(fromEnv) > 0 ? Number(fromEnv) : Number(fromSettings) > 0 ? Number(fromSettings) : 3000;
  const apiPort = await findFreePort(preferredApiPort);
  const fabricPort = await findFreePort(9777);
  const vitePort = Number(process.env.VITE_PORT) || 5170;
  const proxyTarget = `http://127.0.0.1:${apiPort}`;
  /** Browser connects WebSocket/WebRTC signaling directly to the Hub HTTP port (not Vite). */
  const hubAddress = process.env.VITE_HUB_ADDRESS || `127.0.0.1:${apiPort}`;

  console.log(`[dev-runner] API порт: ${apiPort}${apiPort !== preferredApiPort ? ` (${preferredApiPort} был занят)` : ""}`);
  console.log(`[dev-runner] Fabric P2P порт: ${fabricPort}`);
  console.log(`[dev-runner] Vite порт: ${vitePort}`);
  console.log(`[dev-runner] Proxy /api -> ${proxyTarget}`);
  console.log(`[dev-runner] Bridge hubAddress -> ${hubAddress}`);

  const sharedEnv = { ...process.env };
  const apiEnv = {
    ...sharedEnv,
    PORT: String(apiPort),
    FABRIC_HUB_PORT: String(apiPort),
    FABRIC_PORT: String(fabricPort),
    FABRIC_BITCOIN_ENABLE: sharedEnv.FABRIC_BITCOIN_ENABLE ?? "false",
  };
  const viteEnv = {
    ...sharedEnv,
    VITE_API_PROXY_TARGET: proxyTarget,
    VITE_PORT: String(vitePort),
    VITE_HUB_ADDRESS: hubAddress,
  };

  const apiProcess = spawnProcess(process.execPath, ["server/api.mjs"], apiEnv);
  const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
  const viteProcess = spawnProcess(process.execPath, [viteBin], viteEnv);

  let shuttingDown = false;
  const shutdown = (reason) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[dev-runner] Остановка (${reason})...`);
    if (!apiProcess.killed) apiProcess.kill("SIGTERM");
    if (!viteProcess.killed) viteProcess.kill("SIGTERM");
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  apiProcess.on("exit", (code, signal) => {
    if (!shuttingDown) shutdown(`API завершился (code=${code ?? "null"}, signal=${signal ?? "null"})`);
  });
  viteProcess.on("exit", (code, signal) => {
    if (!shuttingDown) shutdown(`Vite завершился (code=${code ?? "null"}, signal=${signal ?? "null"})`);
  });
}

main().catch((error) => {
  console.error(`[dev-runner] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
