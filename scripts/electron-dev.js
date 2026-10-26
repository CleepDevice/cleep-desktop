/**
 * Dev wrapper around Electron for `npm run start:dev`.
 *
 * - Normal quit → exit and let concurrently (-k) stop tsc/esbuild watchers.
 * - Exit code 75 → restart Electron only (main-process hot reload via dev-reloader).
 */
const { spawn } = require('child_process');
const electron = require('electron');

/** Must match DEV_RESTART_EXIT_CODE in src/utils/dev-reloader.ts */
const RESTART_EXIT_CODE = 75;

let child = null;
let restarting = false;

function start() {
  restarting = false;
  child = spawn(electron, ['./build/main.js', ...process.argv.slice(2)], {
    stdio: 'inherit',
    windowsHide: false,
  });

  child.on('close', (code, signal) => {
    child = null;
    if (code === RESTART_EXIT_CODE) {
      restarting = true;
      start();
      return;
    }
    if (signal) {
      process.exit(0);
      return;
    }
    process.exit(code ?? 0);
  });
}

function forwardSignal(signal) {
  if (child && !child.killed) {
    child.kill(signal);
    return;
  }
  if (!restarting) {
    process.exit(0);
  }
}

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

start();
