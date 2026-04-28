import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev over a tunnel (e.g. ngrok `ngrok http 5173`): https://ngrok.com/docs/getting-started
// Vite host check: https://vite.dev/config/server-options.html#server-allowedhosts
// allowedHosts: true снимает «Blocked request» для произвольного Host; только для разработки.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // В dev нужен корневой путь, чтобы туннель открывался по `/`.
  base: command === "serve" ? "/" : "/components/dom-i-zadachi/",
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
