import type { HTMLAttributes } from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "fabric-interface": HTMLAttributes<HTMLElement> & { id?: string };
      "fabric-container": HTMLAttributes<HTMLElement> & { id?: string };
      "fabric-react-component": HTMLAttributes<HTMLElement> & { id?: string };
    }
  }
}

export {};
