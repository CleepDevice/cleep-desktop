import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  buildCoreRsyncCommand,
  buildRsyncCommand,
  computeDeveloperSyncDelay,
  DEVELOPER_CORE_SYNC_DIRS,
  DEVELOPER_CORE_SYNC_FILES,
  DEVELOPER_SYNC_BURST_QUIET_MS,
  DEVELOPER_SYNC_MAX_WAIT_MS,
  DEVELOPER_SYNC_QUIET_MS,
  DEVELOPER_DEVICE_LOG_SPLIT,
  DEVELOPER_SYNC_REMOTE_MODULES,
  DEVELOPER_SYNC_REMOTE_ROOT,
  getDeveloperSyncPlatformSupport,
  parseDeveloperDeviceLogPayload,
  parseRemoteModulesListing,
} from '../../src/developer-sync';

describe('developer-sync', () => {
  it('reports windows as unsupported', () => {
    expect(['supported', 'unsupported']).toContain(getDeveloperSyncPlatformSupport());
  });

  it('builds sshpass rsync command for one app', () => {
    const localPath = path.join('/tmp', 'sources', 'cleepapp-demo');
    const cmd = buildRsyncCommand(
      '192.168.1.50',
      { username: 'root', password: 'secret' },
      { localPath, moduleName: 'demo' },
    );

    expect(cmd.command).toBe('sshpass');
    expect(cmd.args[0]).toBe('-e');
    expect(cmd.args[1]).toBe('rsync');
    expect(cmd.args).toContain('-az');
    expect(cmd.args).toContain('--delete');
    expect(cmd.args).toContain('--exclude');
    expect(cmd.env.SSHPASS).toBe('secret');

    const eIdx = cmd.args.indexOf('-e', 2);
    expect(eIdx).toBeGreaterThan(-1);
    const remoteShell = cmd.args[eIdx + 1];
    expect(remoteShell).toContain('ControlMaster=auto');
    expect(remoteShell).toContain('ForwardAgent=no');
    expect(remoteShell).toContain('ControlPersist=60');
    expect(remoteShell).toContain('ConnectTimeout=10');

    const destination = `root@192.168.1.50:${DEVELOPER_SYNC_REMOTE_MODULES}/demo/`;
    expect(cmd.args[cmd.args.length - 1]).toBe(destination);
    expect(cmd.args[cmd.args.length - 2]).toBe(`${localPath}${path.sep}`);
  });

  it('builds pull rsync with remote as source', () => {
    const localPath = path.join('/tmp', 'sources', 'cleepapp-demo');
    const cmd = buildRsyncCommand(
      '192.168.1.50',
      { username: 'root', password: 'secret' },
      { localPath, moduleName: 'demo' },
      'pull',
    );

    const remote = `root@192.168.1.50:${DEVELOPER_SYNC_REMOTE_MODULES}/demo/`;
    expect(cmd.args[cmd.args.length - 2]).toBe(remote);
    expect(cmd.args[cmd.args.length - 1]).toBe(`${localPath}${path.sep}`);
  });

  it('builds core rsync with modules excluded and allowlisted paths', () => {
    const localPath = path.join('/tmp', 'sources', 'cleep');
    const cmd = buildCoreRsyncCommand(
      '192.168.1.50',
      { username: 'root', password: 'secret' },
      localPath,
    );

    expect(cmd.command).toBe('sshpass');
    expect(cmd.args[0]).toBe('-e');
    expect(cmd.args[1]).toBe('rsync');
    expect(cmd.args).toContain('-az');
    expect(cmd.args).toContain('--delete');
    expect(cmd.env.SSHPASS).toBe('secret');

    // modules exclude must appear before --delete is meaningless for order of flags,
    // but must be present so remote apps under modules/ are preserved.
    const excludeIdx = cmd.args.indexOf('--exclude');
    expect(excludeIdx).toBeGreaterThan(-1);
    expect(cmd.args.slice(excludeIdx, excludeIdx + 4)).toEqual(
      expect.arrayContaining(['--exclude', 'modules/']),
    );
    expect(cmd.args).toContain('modules/');
    expect(cmd.args).toContain('modules');

    for (const dir of DEVELOPER_CORE_SYNC_DIRS) {
      expect(cmd.args).toContain(`${dir}/`);
      expect(cmd.args).toContain(`${dir}/***`);
    }
    for (const file of DEVELOPER_CORE_SYNC_FILES) {
      expect(cmd.args).toContain(file);
    }

    const destination = `root@192.168.1.50:${DEVELOPER_SYNC_REMOTE_ROOT}/`;
    expect(cmd.args[cmd.args.length - 1]).toBe(destination);
    expect(cmd.args[cmd.args.length - 2]).toBe(`${localPath}${path.sep}`);
  });

  it('builds core pull rsync with remote as source', () => {
    const localPath = path.join('/tmp', 'sources', 'cleep');
    const cmd = buildCoreRsyncCommand(
      '192.168.1.50',
      { username: 'root', password: 'secret' },
      localPath,
      'pull',
    );
    const remote = `root@192.168.1.50:${DEVELOPER_SYNC_REMOTE_ROOT}/`;
    expect(cmd.args).toContain('modules/');
    expect(cmd.args[cmd.args.length - 2]).toBe(remote);
    expect(cmd.args[cmd.args.length - 1]).toBe(`${localPath}${path.sep}`);
  });

  it('parses remote modules listing', () => {
    expect(parseRemoteModulesListing('audio\ncharts\n.cleep\naudio\n')).toEqual([
      'audio',
      'charts',
    ]);
    expect(parseRemoteModulesListing('')).toEqual([]);
  });

  it('parses device log SSH payload', () => {
    const payload = `12345\n${DEVELOPER_DEVICE_LOG_SPLIT}\nline1\nline2\n`;
    expect(parseDeveloperDeviceLogPayload(payload)).toEqual({
      size: 12345,
      content: 'line1\nline2\n',
    });
    expect(parseDeveloperDeviceLogPayload('orphan')).toEqual({ size: 0, content: 'orphan' });
  });

  it('uses a short quiet window for an isolated change', () => {
    const first = computeDeveloperSyncDelay(
      { batchStartedAt: null, lastChangeAt: null, changeCount: 0 },
      1_000,
    );
    expect(first.inBurst).toBe(false);
    expect(first.delayMs).toBe(DEVELOPER_SYNC_QUIET_MS);
    expect(first.changeCount).toBe(1);
  });

  it('stretches the quiet window during a Cursor-like burst', () => {
    let state = { batchStartedAt: null as number | null, lastChangeAt: null as number | null, changeCount: 0 };
    let now = 1_000;
    for (let i = 0; i < 3; i += 1) {
      const next = computeDeveloperSyncDelay(state, now);
      state = {
        batchStartedAt: next.batchStartedAt,
        lastChangeAt: next.lastChangeAt,
        changeCount: next.changeCount,
      };
      now += 400;
      if (i === 2) {
        expect(next.inBurst).toBe(true);
        expect(next.delayMs).toBe(DEVELOPER_SYNC_BURST_QUIET_MS);
      }
    }
  });

  it('caps delay with max wait from the first change of a batch', () => {
    const startedAt = 1_000;
    const next = computeDeveloperSyncDelay(
      {
        batchStartedAt: startedAt,
        lastChangeAt: startedAt + DEVELOPER_SYNC_MAX_WAIT_MS - 500,
        changeCount: 8,
      },
      startedAt + DEVELOPER_SYNC_MAX_WAIT_MS - 200,
    );
    expect(next.inBurst).toBe(true);
    expect(next.delayMs).toBe(200);

    const overdue = computeDeveloperSyncDelay(
      {
        batchStartedAt: startedAt,
        lastChangeAt: startedAt + DEVELOPER_SYNC_MAX_WAIT_MS,
        changeCount: 9,
      },
      startedAt + DEVELOPER_SYNC_MAX_WAIT_MS + 50,
    );
    expect(overdue.delayMs).toBe(0);
  });
});
