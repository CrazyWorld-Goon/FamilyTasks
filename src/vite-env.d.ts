/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Hub HTTP host:port for WebSocket/WebRTC (dev: same as API server, not Vite). */
  readonly VITE_HUB_ADDRESS?: string;
  /** Public Fabric Hub HTTPS origin (`https://hub.fabric.pub`). Used for faucet + explorer links when bypassing `/api/public-faucet`. */
  readonly VITE_PUBLIC_FABRIC_HUB_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
