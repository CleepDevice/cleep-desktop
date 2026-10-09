import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import { app } from 'electron';
import { getHtmlFilePath, getProjectRoot, getResourceFilePath } from '../../src/utils/paths';

describe('paths', () => {
  beforeEach(() => {
    vi.mocked(app).isPackaged = true;
  });

  it('resolves packaged assets from the app root next to utils/', () => {
    vi.mocked(app).isPackaged = true;

    const root = getProjectRoot();
    expect(getHtmlFilePath('index.html')).toBe(path.join(root, 'html', 'index.html'));
    expect(getResourceFilePath('256x256.png')).toBe(path.join(root, 'resources', '256x256.png'));
    expect(root.endsWith(`${path.sep}utils`)).toBe(false);
  });

  it('resolves development assets from the repository root', () => {
    vi.mocked(app).isPackaged = false;

    const root = getProjectRoot();
    expect(getHtmlFilePath('index.html')).toBe(path.join(root, 'html', 'index.html'));
    expect(getResourceFilePath('256x256.png')).toBe(path.join(root, 'resources', '256x256.png'));
    expect(root.includes(`${path.sep}build`)).toBe(false);
  });
});
