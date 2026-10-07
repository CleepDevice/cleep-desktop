import type { CleepApi } from './ipc/ipc-api';

declare global {
  interface Window {
    /**
     * Preload bridge.
     * Prefer `cleep.api` (semantic domain methods).
     * `cleep.ipc` is the low-level allowlisted channel surface.
     */
    cleep: {
      api: CleepApi;
      ipc: {
        invoke(channel: string, data?: unknown): Promise<unknown>;
        send(channel: string, data?: unknown): void;
        /** @returns unsubscribe */
        on(channel: string, listener: (event: null, ...args: unknown[]) => void): () => void;
      };
    };
  }
}

export {};
