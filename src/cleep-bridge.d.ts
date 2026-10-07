declare global {
  interface Window {
    /** Preload bridge — channel names/payloads: src/ipc/ipc-contract.ts */
    cleep: {
      ipc: {
        invoke(channel: string, data?: unknown): Promise<unknown>;
        send(channel: string, data?: unknown): void;
        on(channel: string, listener: (event: null, ...args: unknown[]) => void): void;
      };
    };
  }
}

export {};
