import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev over a tunnel (e.g. ngrok `ngrok http 5173`): https://ngrok.com/docs/getting-started
// Vite host check: https://vite.dev/config/server-options.html#server-allowedhosts
// allowedHosts: true снимает «Blocked request» для произвольного Host; только для разработки.
export default defineConfig({
  plugins: [react()],
  base: "/components/dom-i-zadachi/",
  server: {
    allowedHosts: true,
  },
});
