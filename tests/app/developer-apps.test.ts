import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  detectModuleName,
  listDeveloperApps,
  resolveSelectedDeveloperApps,
} from '../../src/developer-apps';

describe('developer-apps', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeSourcesRoot(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleep-dev-apps-'));
    tempDirs.push(dir);
    return dir;
  }

  function writeApp(root: string, folderName: string, className: string, fileName?: string): string {
    const appDir = path.join(root, folderName);
    const backend = path.join(appDir, 'backend');
    fs.mkdirSync(backend, { recursive: true });
    const pyName = fileName || `${className.toLowerCase()}.py`;
    fs.writeFileSync(
      path.join(backend, pyName),
      [
        'from cleep.core import CleepModule',
        '',
        `class ${className}(CleepModule):`,
        '    pass',
        '',
      ].join('\n'),
      'utf8',
    );
    return appDir;
  }

  it('detects module name from CleepModule class', () => {
    const root = makeSourcesRoot();
    const appDir = writeApp(root, 'cleepapp-developer', 'Developer');
    expect(detectModuleName(appDir)).toBe('developer');
  });

  it.each([
    ['CleepRemoteAccessModule', 'Gateway', 'gateway'],
    ['CleepRenderer', 'Display', 'display'],
    ['CleepResources', 'Assets', 'assets'],
    ['CleepExternalBus', 'BusApp', 'busapp'],
  ] as const)('detects base class %s', (baseClass, className, moduleName) => {
    const root = makeSourcesRoot();
    const appDir = path.join(root, moduleName);
    fs.mkdirSync(path.join(appDir, 'backend'), { recursive: true });
    fs.writeFileSync(
      path.join(appDir, 'backend', `${moduleName}.py`),
      `class ${className}(${baseClass}):\n    pass\n`,
      'utf8',
    );
    expect(detectModuleName(appDir)).toBe(moduleName);
  });

  it('rejects non-app Cleep bases like CleepRpcWrapper', () => {
    const root = makeSourcesRoot();
    const appDir = path.join(root, 'wrapper');
    fs.mkdirSync(path.join(appDir, 'backend'), { recursive: true });
    fs.writeFileSync(
      path.join(appDir, 'backend', 'wrapper.py'),
      'class Wrapper(CleepRpcWrapper):\n    pass\n',
      'utf8',
    );
    expect(detectModuleName(appDir)).toBeNull();
  });

  it('lists folders and marks invalid ones', () => {
    const root = makeSourcesRoot();
    writeApp(root, 'cleepapp-charts', 'Charts');
    fs.mkdirSync(path.join(root, 'notes'), { recursive: true });
    fs.writeFileSync(path.join(root, 'notes', 'readme.txt'), 'hello');

    const entries = listDeveloperApps(root);
    expect(entries).toHaveLength(2);

    const charts = entries.find((entry) => entry.folderName === 'cleepapp-charts');
    const notes = entries.find((entry) => entry.folderName === 'notes');
    expect(charts).toMatchObject({
      valid: true,
      moduleName: 'charts',
      label: 'cleepapp-charts → charts',
    });
    expect(notes).toMatchObject({
      valid: false,
      moduleName: null,
      label: 'notes',
    });
  });

  it('resolves only selected valid apps', () => {
    const root = makeSourcesRoot();
    writeApp(root, 'alpha', 'Alpha');
    writeApp(root, 'beta', 'Beta');
    fs.mkdirSync(path.join(root, 'junk'), { recursive: true });

    expect(resolveSelectedDeveloperApps(root, [])).toEqual([]);
    expect(resolveSelectedDeveloperApps(root, ['junk', 'missing'])).toEqual([]);
    expect(
      resolveSelectedDeveloperApps(root, ['beta', 'junk']).map((entry) => entry.moduleName),
    ).toEqual(['beta']);
  });
});
