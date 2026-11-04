import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CLEEP_CORE_FOLDER_NAME,
  detectCleepCoreDir,
  isCleepCoreDir,
} from '../../src/developer-core';

describe('developer-core', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeCoreCheckout(parent: string): string {
    const core = path.join(parent, CLEEP_CORE_FOLDER_NAME);
    fs.mkdirSync(path.join(core, 'cleep'), { recursive: true });
    fs.writeFileSync(path.join(core, 'setup.py'), 'from setuptools import setup\n', 'utf8');
    return core;
  }

  it('detects a valid cleep core checkout under sources', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cleep-core-'));
    tempDirs.push(root);
    const core = makeCoreCheckout(root);

    expect(isCleepCoreDir(core)).toBe(true);
    expect(detectCleepCoreDir(root)).toBe(core);
  });

  it('rejects folders missing setup.py or package dir', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cleep-core-bad-'));
    tempDirs.push(root);
    const incomplete = path.join(root, CLEEP_CORE_FOLDER_NAME);
    fs.mkdirSync(incomplete, { recursive: true });
    fs.writeFileSync(path.join(incomplete, 'setup.py'), 'x', 'utf8');

    expect(isCleepCoreDir(incomplete)).toBe(false);
    expect(detectCleepCoreDir(root)).toBeNull();
  });

  it('returns null when sources dir is empty', () => {
    expect(detectCleepCoreDir('')).toBeNull();
    expect(detectCleepCoreDir('/tmp/does-not-exist-cleep-core')).toBeNull();
  });
});
