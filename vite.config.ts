import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev over a tunnel (e.g. ngrok `ngrok http 5173`): https://ngrok.com/docs/getting-started
// Vite host check: https://vite.dev/config/server-options.html#server-allowedhosts
// allowedHosts: true снимает «Blocked request» для произвольного Host; только для разработки.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  // Dev: `/`. Prod default `/` so `npm run build && npm start` serves from Hub HTTP root (see server/api.mjs).
  // Override for hosted paths: `FABRIC_APP_BASE=/components/dom-i-zadachi/ vite build` or `vite build --base=…`.
  base:
    command === "serve"
      ? "/"
      : (process.env.FABRIC_APP_BASE?.trim() || "/"),
  server: {
    host: true,
    allowedHosts: true,
    port: Number(process.env.VITE_PORT) || 5170,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
}));
