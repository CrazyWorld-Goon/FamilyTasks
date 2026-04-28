/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Hub HTTP host:port for WebSocket/WebRTC (dev: same as API server, not Vite). */
  readonly VITE_HUB_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
