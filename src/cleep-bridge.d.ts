declare global {
  interface Window {
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
