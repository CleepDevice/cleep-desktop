import path from 'path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

const ROOT = path.resolve(__dirname, '../..');
const MAIN_JS = path.join(ROOT, 'build', 'main.js');

export async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [MAIN_JS],
    cwd: ROOT,
    env: {
      ...process.env,
      CLEEPDESKTOP_E2E: '1',
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
  });

  const page = await waitForMainWindow(app);
  await dismissWelcomeDialog(page);
  return { app, page };
}

/** Close first-run help modal if it still appears (race with Angular $timeout). */
async function dismissWelcomeDialog(page: Page): Promise<void> {
  const dialog = page.locator('md-dialog').filter({ hasText: 'Welcome to CleepDesktop' });
  try {
    await dialog.waitFor({ state: 'visible', timeout: 3_000 });
    await dialog.getByRole('button').filter({ has: page.getByRole('img', { name: 'close' }) }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 5_000 });
  } catch {
    // Not shown — first-run already disabled.
  }
}

/**
 * Splash shows first (loading.html). Wait for index.html main UI.
 */
async function waitForMainWindow(app: ElectronApplication): Promise<Page> {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    const windows = app.windows();
    for (const window of windows) {
      try {
        const ready = await window.evaluate(() => {
          const href = location.href || '';
          const text = document.body?.innerText || '';
          return href.includes('index.html') && text.includes('Cleep devices');
        });
        if (ready) {
          await window.waitForLoadState('domcontentloaded');
          await window.waitForTimeout(500);
          return window;
        }
      } catch {
        // Window may have been closed (splash) or not yet navigable.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error('Timed out waiting for CleepDesktop main window');
}
