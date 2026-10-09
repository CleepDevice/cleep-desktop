/**
 * Override process.platform for cross-OS unit tests.
 * Uses a getter: assigning a plain value is unreliable on some Node/OS combos
 * (macOS/Windows CI runners especially).
 */
export function mockProcessPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    enumerable: true,
    get: () => platform,
  });
}
