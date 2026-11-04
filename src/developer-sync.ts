import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import type { DeveloperAppEntry } from './developer-apps';
import type { DeveloperSshSecret } from './developer-ssh';
import { appLogger } from './app-logger';

const execFileAsync = promisify(execFile);

export const DEVELOPER_SYNC_REMOTE_MODULES = '/root/cleep-dev/modules';
/** Remote root for Cleep core (apps stay under modules/). */
export const DEVELOPER_SYNC_REMOTE_ROOT = '/root/cleep-dev';

/** Directories synced from local cleep/ into DEVELOPER_SYNC_REMOTE_ROOT. */
export const DEVELOPER_CORE_SYNC_DIRS = [
  'bin',
  'cleep',
  'debian',
  'html',
  'medias',
  'scripts',
  'conf',
] as const;

/** Root build/meta files synced with the core tree. */
export const DEVELOPER_CORE_SYNC_FILES = [
  'requirements.txt',
  'requirements-test.txt',
  'setup.py',
  'MANIFEST.in',
  'packages.list',
  'Dockerfile',
  'LICENSE',
  'README.md',
  'CHANGES',
  'COPYING',
  'pytest.ini',
  '.pylintrc',
] as const;

/** Quiet window after an isolated change before syncing. */
export const DEVELOPER_SYNC_QUIET_MS = 2000;
/** Quiet window while a save burst is still raining (Cursor multi-file writes). */
export const DEVELOPER_SYNC_BURST_QUIET_MS = 5000;
/** Changes closer than this are counted as part of the same burst. */
export const DEVELOPER_SYNC_BURST_GAP_MS = 1500;
/** Enter burst mode after this many clustered changes. */
export const DEVELOPER_SYNC_BURST_THRESHOLD = 3;
/** Never delay longer than this from the first change of a batch. */
export const DEVELOPER_SYNC_MAX_WAIT_MS = 12000;

export type DeveloperSyncPlatformSupport = 'supported' | 'unsupported';

export type DeveloperSyncDelayState = {
  batchStartedAt: number | null;
  lastChangeAt: number | null;
  changeCount: number;
};

export type DeveloperSyncDelayResult = DeveloperSyncDelayState & {
  delayMs: number;
  inBurst: boolean;
};

/**
 * Trailing debounce with burst stretch + max wait.
 * Isolated edits wait QUIET_MS; dense Cursor-like bursts wait BURST_QUIET_MS,
 * but a batch never stalls past MAX_WAIT_MS from its first change.
 */
export function computeDeveloperSyncDelay(
  state: DeveloperSyncDelayState,
  now: number = Date.now(),
): DeveloperSyncDelayResult {
  const isContinuation =
    state.lastChangeAt !== null && now - state.lastChangeAt <= DEVELOPER_SYNC_BURST_GAP_MS;
  const changeCount = isContinuation ? state.changeCount + 1 : 1;
  const batchStartedAt =
    changeCount === 1 || state.batchStartedAt === null ? now : state.batchStartedAt;
  const inBurst = changeCount >= DEVELOPER_SYNC_BURST_THRESHOLD;
  const quietMs = inBurst ? DEVELOPER_SYNC_BURST_QUIET_MS : DEVELOPER_SYNC_QUIET_MS;
  const remainingMax = Math.max(0, DEVELOPER_SYNC_MAX_WAIT_MS - (now - batchStartedAt));
  const delayMs = remainingMax === 0 ? 0 : Math.min(quietMs, remainingMax);

  return {
    batchStartedAt,
    lastChangeAt: now,
    changeCount,
    delayMs,
    inBurst,
  };
}

export type RsyncAppTarget = {
  localPath: string;
  moduleName: string;
};

const RSYNC_EXCLUDES = [
  '.git',
  '.gitignore',
  '.vscode',
  '.idea',
  'node_modules',
  '.venv',
  'venv',
  '__pycache__',
  '*.pyc',
  '.pytest_cache',
  '.coverage',
  'htmlcov',
  'dist',
  'build',
];

export function getDeveloperSyncPlatformSupport(): DeveloperSyncPlatformSupport {
  return process.platform === 'win32' ? 'unsupported' : 'supported';
}

export async function commandExists(command: string): Promise<boolean> {
  try {
    await execFileAsync('which', [command]);
    return true;
  } catch {
    return false;
  }
}

export async function assertSyncToolsAvailable(): Promise<void> {
  if (getDeveloperSyncPlatformSupport() === 'unsupported') {
    throw new Error('Source sync is not supported on Windows yet');
  }
  const [hasRsync, hasSshpass] = await Promise.all([
    commandExists('rsync'),
    commandExists('sshpass'),
  ]);
  if (!hasRsync) {
    throw new Error('rsync is required for developer sync (install rsync)');
  }
  if (!hasSshpass) {
    throw new Error('sshpass is required for developer sync (install sshpass)');
  }
}

function buildSshDestination(host: string, username: string, remotePath: string): string {
  return `${username}@${host}:${remotePath}`;
}

export function buildRsyncCommand(
  host: string,
  ssh: DeveloperSshSecret,
  target: RsyncAppTarget,
): { command: string; args: string[]; env: NodeJS.ProcessEnv } {
  const local = target.localPath.endsWith(path.sep)
    ? target.localPath
    : `${target.localPath}${path.sep}`;
  const remotePath = `${DEVELOPER_SYNC_REMOTE_MODULES}/${target.moduleName}/`;
  const destination = buildSshDestination(host, ssh.username, remotePath);

  const rsyncArgs = ['-az', '--delete'];
  for (const pattern of RSYNC_EXCLUDES) {
    rsyncArgs.push('--exclude', pattern);
  }
  rsyncArgs.push(
    '-e',
    'ssh -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password -o PubkeyAuthentication=no',
  );
  rsyncArgs.push(local, destination);

  return {
    command: 'sshpass',
    args: ['-e', 'rsync', ...rsyncArgs],
    env: {
      ...process.env,
      SSHPASS: ssh.password,
    },
  };
}

/**
 * Build rsync for Cleep core → /root/cleep-dev/.
 * Always excludes ``modules/`` before --delete so remote apps are preserved.
 * Allowlists known dirs/files; everything else at the root is skipped.
 */
export function buildCoreRsyncCommand(
  host: string,
  ssh: DeveloperSshSecret,
  localCorePath: string,
): { command: string; args: string[]; env: NodeJS.ProcessEnv } {
  const local = localCorePath.endsWith(path.sep)
    ? localCorePath
    : `${localCorePath}${path.sep}`;
  const destination = buildSshDestination(
    host,
    ssh.username,
    `${DEVELOPER_SYNC_REMOTE_ROOT}/`,
  );

  // Exclude modules first so --delete never removes remote apps.
  const rsyncArgs = ['-az', '--delete', '--exclude', 'modules/', '--exclude', 'modules'];
  for (const pattern of RSYNC_EXCLUDES) {
    rsyncArgs.push('--exclude', pattern);
  }
  for (const dir of DEVELOPER_CORE_SYNC_DIRS) {
    rsyncArgs.push('--include', `${dir}/`, '--include', `${dir}/***`);
  }
  for (const file of DEVELOPER_CORE_SYNC_FILES) {
    rsyncArgs.push('--include', file);
  }
  rsyncArgs.push('--exclude', '*');
  rsyncArgs.push(
    '-e',
    'ssh -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password -o PubkeyAuthentication=no',
  );
  rsyncArgs.push(local, destination);

  return {
    command: 'sshpass',
    args: ['-e', 'rsync', ...rsyncArgs],
    env: {
      ...process.env,
      SSHPASS: ssh.password,
    },
  };
}

function runCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      reject(error);
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const detail = (stderr || stdout || `exit code ${code}`).trim();
      reject(new Error(detail || `Command failed: ${command}`));
    });
  });
}

export async function rsyncDeveloperApps(options: {
  host: string;
  ssh: DeveloperSshSecret;
  apps: DeveloperAppEntry[];
}): Promise<void> {
  await assertSyncToolsAvailable();
  const host = String(options.host || '').trim();
  if (!host) {
    throw new Error('Development device has no IP address');
  }
  if (!options.apps.length) {
    throw new Error('No applications selected for sync');
  }

  const targets = options.apps.filter((app) => app.valid && app.moduleName);
  if (!targets.length) {
    throw new Error('No valid applications to sync');
  }

  // Sync selected apps in parallel (one rsync process per module).
  await Promise.all(
    targets.map(async (app) => {
      const cmd = buildRsyncCommand(host, options.ssh, {
        localPath: app.absolutePath,
        moduleName: app.moduleName,
      });
      appLogger.info('Developer sync rsync', {
        moduleName: app.moduleName,
        localPath: app.absolutePath,
        host,
      });
      await runCommand(cmd.command, cmd.args, cmd.env);
    }),
  );
}

export async function rsyncDeveloperCore(options: {
  host: string;
  ssh: DeveloperSshSecret;
  localCorePath: string;
}): Promise<void> {
  await assertSyncToolsAvailable();
  const host = String(options.host || '').trim();
  if (!host) {
    throw new Error('Development device has no IP address');
  }
  const localCorePath = String(options.localCorePath || '').trim();
  if (!localCorePath) {
    throw new Error('Cleep core path is missing');
  }

  const cmd = buildCoreRsyncCommand(host, options.ssh, localCorePath);
  appLogger.info('Developer sync rsync core', {
    localPath: localCorePath,
    remoteRoot: DEVELOPER_SYNC_REMOTE_ROOT,
    host,
  });
  await runCommand(cmd.command, cmd.args, cmd.env);
}
