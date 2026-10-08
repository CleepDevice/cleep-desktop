import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from './helpers/launch';

test.describe.configure({ mode: 'serial' });

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await launchApp());
});

test.afterAll(async () => {
  if (app) {
    await app.close();
  }
});

async function openSidenavItem(title: string): Promise<void> {
  await page.locator(`md-list-item[title="${title}"]`).first().click();
}

test('shows homepage and devices panel', async () => {
  await expect(page.getByRole('heading', { name: 'Cleep devices' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'CleepDesktop', exact: true })).toBeVisible();
  await expect(page.getByText('News', { exact: true })).toBeVisible();
});

test('navigates to Cleep install page', async () => {
  await openSidenavItem('Install');
  await expect(page.locator('md-toolbar h2', { hasText: 'Cleep installation' })).toBeVisible();
  await expect(page.getByText('Preparation')).toBeVisible();
  await expect(page.getByText('No version selected')).toBeVisible();
  await expect(page.getByText('No drive selected')).toBeVisible();
});

test('install page exposes flash tool branding without requiring hardware', async () => {
  await openSidenavItem('Install');
  // Network/WiFi options only appear after a CleepOs ISO is selected — assert the always-visible path.
  await expect(page.getByText('Select CleepOs version you want to install on your SD card')).toBeVisible();
  await expect(page.getByText(/Plug your SD card|USB card reader/i)).toBeVisible();
  await expect(page.getByText(/Powered by/i)).toBeVisible();
  await expect(page.getByText('Raspberry Pi Imager')).toBeVisible();
});

test('opens preferences dialog', async () => {
  await openSidenavItem('Preferences');
  const dialog = page.getByRole('dialog').filter({ hasText: 'Preferences' });
  await expect(dialog.getByRole('heading', { name: 'Preferences' })).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'General' })).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'Network' })).toBeVisible();
  // Angular Material exposes the close control as a native button + img "close".
  await dialog.getByRole('button').filter({ has: page.getByRole('img', { name: 'close' }) }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
});

test('navigates to monitoring page', async () => {
  await openSidenavItem('Monitoring');
  await expect(page.locator('md-toolbar h2', { hasText: 'Monitoring' })).toBeVisible();
});

test('opens ISO version selection dialog without flashing', async () => {
  await openSidenavItem('Install');
  const isoRow = page.locator('md-list-item', { hasText: 'No version selected' });
  await isoRow.getByRole('button').click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Version selection' });
  await expect(dialog.getByRole('heading', { name: 'Version selection' })).toBeVisible();
  await dialog.getByRole('button').filter({ has: page.getByRole('img', { name: 'close' }) }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
});

test('returns to homepage from sidenav', async () => {
  await openSidenavItem('Homepage');
  await expect(page.getByRole('heading', { name: 'CleepDesktop', exact: true })).toBeVisible();
  await expect(page.getByText('News', { exact: true })).toBeVisible();
});

test('exposes preload bridge on window.cleep', async () => {
  const bridge = await page.evaluate(() => {
    const cleep = (window as unknown as { cleep?: { api?: unknown; ipc?: unknown } }).cleep;
    return {
      hasApi: !!cleep?.api,
      hasIpc: !!cleep?.ipc,
    };
  });
  expect(bridge).toEqual({ hasApi: true, hasIpc: true });
});
