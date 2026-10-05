import path from 'path';
import { app } from 'electron';

/**
 * Resolve project assets.
 * This module is compiled to `<root>/utils/paths.js`.
 * - Packaged: html/resources live next to `utils/` (app root).
 * - Development: Electron runs from `build/`, but html/resources live at the repo root.
 */
export function getProjectRoot(): string {
  const appRoot = path.join(__dirname, '..');
  return app.isPackaged ? appRoot : path.join(appRoot, '..');
}

export function getHtmlFilePath(...parts: string[]): string {
  return path.join(getProjectRoot(), 'html', ...parts);
}

export function getResourceFilePath(...parts: string[]): string {
  return path.join(getProjectRoot(), 'resources', ...parts);
}
