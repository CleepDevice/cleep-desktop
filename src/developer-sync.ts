import { execFile, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import { promisify } from 'util';
import path from 'path';
import type { DeveloperAppEntry } from './developer-apps';
import type { DeveloperSshSecret } from './developer-ssh';
import { appLogger } from './app-logger';

const execFileAsync = promisify(execFile);

export const DEVELOPER_SYNC_REMOTE_MODULES = '/root/cleep-dev/modules';
/** Remote root for Cleep core (apps stay under modules/). */
export const DEVELOPER_SYNC_REMOTE_ROOT = '/root/cleep-dev';
/** Remote requirements file synced with the core tree. */
export const DEVELOPER_REQUIREMENTS_REMOTE_PATH = `${DEVELOPER_SYNC_REMOTE_ROOT}/requirements.txt`;
/** Remote test requirements file synced with the core tree. */
export const DEVELOPER_REQUIREMENTS_TEST_REMOTE_PATH = `${DEVELOPER_SYNC_REMOTE_ROOT}/requirements-test.txt`;
/** Device Cleep log file tailed for the developer sync page. */
export const DEVELOPER_DEVICE_LOG_PATH = '/var/log/cleep.log';
/** Max lines returned by the device log tail. */
export const DEVELOPER_DEVICE_LOG_LINES = 400;

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

/** Result of probing rsync/sshpass (and WSL on Windows). */
export type DeveloperSyncToolsStatus = {
  /** Probe finished at least once. */
  probed: boolean;
  /** Tools required for sync are available. */
  supported: boolean;
  /** Commands run through ``wsl.exe`` (Windows only). */
  viaWsl: boolean;
  hasWsl: boolean;
  hasRsync: boolean;
  hasSshpass: boolean;
  /** Human-readable missing tool names (``wsl``, ``rsync``, ``sshpass``). */
  missing: string[];
  /** Orange banner / toast copy when unsupported. */
  message: string;
};

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

/** push = local → Pi (default watch/upload); pull = Pi → local. */
export type DeveloperSyncDirection = 'push' | 'pull';

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

/** Shared ControlMaster sockets (native). WSL uses ``WSL_SSH_CONTROL_DIR`` instead. */
const DEVELOPER_SSH_CONTROL_DIR = path.join(os.tmpdir(), 'cleep-desktop-ssh');
const WSL_SSH_CONTROL_DIR = '/tmp/cleep-desktop-ssh';

const DEFAULT_SYNC_TOOLS: DeveloperSyncToolsStatus = {
  probed: false,
  supported: false,
  viaWsl: false,
  hasWsl: false,
  hasRsync: false,
  hasSshpass: false,
  missing: [],
  message: '',
};

let cachedSyncTools: DeveloperSyncToolsStatus = { ...DEFAULT_SYNC_TOOLS };
let syncToolsProbe: Promise<DeveloperSyncToolsStatus> | null = null;

export function getDeveloperSyncToolsStatus(): DeveloperSyncToolsStatus {
  return { ...cachedSyncTools };
}

/**
 * Until the first probe completes: Linux/macOS assumed usable, Windows not
 * (WSL required). After probe, mirrors ``cachedSyncTools.supported``.
 */
export function getDeveloperSyncPlatformSupport(): DeveloperSyncPlatformSupport {
  if (!cachedSyncTools.probed) {
    return process.platform === 'win32' ? 'unsupported' : 'supported';
  }
  return cachedSyncTools.supported ? 'supported' : 'unsupported';
}

/** Map ``C:\\Users\\…`` → ``/mnt/c/Users/…`` for rsync inside WSL. */
export function windowsPathToWslPath(windowsPath: string): string {
  const normalized = String(windowsPath || '').replace(/\\/g, '/');
  const match = /^([A-Za-z]):\/(.*)$/.exec(normalized);
  if (!match) {
    return normalized;
  }
  return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
}

function buildSyncToolsMessage( partial: {
  viaWsl: boolean;
  hasWsl: boolean;
  hasRsync: boolean;
  hasSshpass: boolean;
  missing: string[];
}): string {
  if (partial.missing.length === 0) {
    return '';
  }
  if (process.platform === 'win32') {
    if (!partial.hasWsl) {
      return (
        'Developer mode on Windows requires WSL with rsync and sshpass. ' +
        'Install WSL (wsl --install), open a WSL terminal, then run: sudo apt install rsync sshpass'
      );
    }
    const pkgs = partial.missing.filter((name) => name !== 'wsl').join(' ');
    return (
      'WSL is available but developer sync tools are missing (' +
      partial.missing.join(', ') +
      '). In WSL run: sudo apt install ' +
      (pkgs || 'rsync sshpass')
    );
  }
  if (process.platform === 'darwin') {
    return (
      'Developer mode requires rsync and sshpass (' +
      partial.missing.join(', ') +
      ' missing). Install with Homebrew: brew install rsync sshpass'
    );
  }
  return (
    'Developer mode requires rsync and sshpass (' +
    partial.missing.join(', ') +
    ' missing). Install them with your package manager, e.g. sudo apt install rsync sshpass'
  );
}

async function hostCommandExists(command: string): Promise<boolean> {
  try {
    await execFileAsync('which', [command]);
    return true;
  } catch {
    return false;
  }
}

async function wslAvailable(): Promise<boolean> {
  try {
    await execFileAsync('wsl.exe', ['-e', 'true'], { windowsHide: true, timeout: 20000 });
    return true;
  } catch {
    return false;
  }
}

async function wslCommandExists(command: string): Promise<boolean> {
  try {
    await execFileAsync('wsl.exe', ['-e', 'which', command], {
      windowsHide: true,
      timeout: 20000,
    });
    return true;
  } catch {
    return false;
  }
}

export async function commandExists(command: string): Promise<boolean> {
  if (process.platform === 'win32') {
    if (!(await wslAvailable())) {
      return false;
    }
    return wslCommandExists(command);
  }
  return hostCommandExists(command);
}

export async function probeDeveloperSyncTools(
  options: { force?: boolean } = {},
): Promise<DeveloperSyncToolsStatus> {
  if (!options.force && cachedSyncTools.probed) {
    return getDeveloperSyncToolsStatus();
  }
  if (syncToolsProbe && !options.force) {
    return syncToolsProbe;
  }

  syncToolsProbe = (async () => {
    let hasWsl = false;
    let viaWsl = false;
    let hasRsync = false;
    let hasSshpass = false;
    const missing: string[] = [];

    if (process.platform === 'win32') {
      viaWsl = true;
      hasWsl = await wslAvailable();
      if (!hasWsl) {
        missing.push('wsl');
      } else {
        hasRsync = await wslCommandExists('rsync');
        hasSshpass = await wslCommandExists('sshpass');
        if (!hasRsync) {
          missing.push('rsync');
        }
        if (!hasSshpass) {
          missing.push('sshpass');
        }
      }
    } else {
      hasRsync = await hostCommandExists('rsync');
      hasSshpass = await hostCommandExists('sshpass');
      if (!hasRsync) {
        missing.push('rsync');
      }
      if (!hasSshpass) {
        missing.push('sshpass');
      }
    }

    const supported = missing.length === 0;
    cachedSyncTools = {
      probed: true,
      supported,
      viaWsl,
      hasWsl,
      hasRsync,
      hasSshpass,
      missing,
      message: buildSyncToolsMessage({ viaWsl, hasWsl, hasRsync, hasSshpass, missing }),
    };
    return getDeveloperSyncToolsStatus();
  })();

  try {
    return await syncToolsProbe;
  } finally {
    syncToolsProbe = null;
  }
}

export async function assertSyncToolsAvailable(): Promise<void> {
  const tools = await probeDeveloperSyncTools();
  if (!tools.supported) {
    throw new Error(tools.message || 'Developer sync tools are not available');
  }
  await ensureDeveloperSshControlDir();
}

function buildSshDestination(host: string, username: string, remotePath: string): string {
  return `${username}@${host}:${remotePath}`;
}

function usesWslSync(): boolean {
  return process.platform === 'win32' && cachedSyncTools.viaWsl && cachedSyncTools.supported;
}

function toSyncLocalPath(localPath: string): string {
  if (!usesWslSync()) {
    return localPath;
  }
  return windowsPathToWslPath(localPath);
}

function buildSshpassEnv(ssh: DeveloperSshSecret): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SSHPASS: ssh.password,
  };
  if (usesWslSync()) {
    // Forward SSHPASS into the WSL environment without putting it on argv.
    const existing = String(env.WSLENV || '')
      .split(':')
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => !/^SSHPASS(\/.*)?$/i.test(part));
    existing.push('SSHPASS/u');
    env.WSLENV = existing.join(':');
  }
  return env;
}

function ensureDeveloperSshControlDirNative(): void {
  fs.mkdirSync(DEVELOPER_SSH_CONTROL_DIR, { recursive: true, mode: 0o700 });
}

async function ensureDeveloperSshControlDir(): Promise<void> {
  if (usesWslSync()) {
    await execFileAsync('wsl.exe', ['-e', 'mkdir', '-p', '-m', '700', WSL_SSH_CONTROL_DIR], {
      windowsHide: true,
      timeout: 20000,
    });
    return;
  }
  ensureDeveloperSshControlDirNative();
}

function sshControlPath(): string {
  if (usesWslSync()) {
    return `${WSL_SSH_CONTROL_DIR}/%C`;
  }
  return path.join(DEVELOPER_SSH_CONTROL_DIR, '%C');
}

/**
 * Common ssh options for password auth via sshpass.
 * ControlMaster reuses one TCP session across rsync/ls/log calls (lock still serializes).
 */
function buildSshPasswordArgs(): string[] {
  return [
    '-o',
    'StrictHostKeyChecking=accept-new',
    '-o',
    'PreferredAuthentications=password',
    '-o',
    'PubkeyAuthentication=no',
    '-o',
    'ForwardAgent=no',
    '-o',
    'ConnectTimeout=10',
    '-o',
    'ServerAliveInterval=15',
    '-o',
    'ServerAliveCountMax=3',
    '-o',
    'ControlMaster=auto',
    '-o',
    'ControlPersist=60',
    '-o',
    `ControlPath=${sshControlPath()}`,
  ];
}

/** rsync ``-e`` remote shell string (same options as direct ssh). */
function buildSshRemoteShellCommand(): string {
  return ['ssh', ...buildSshPasswordArgs()].join(' ');
}

/**
 * Build ``sshpass …`` or ``wsl.exe -e sshpass …`` for the current platform.
 */
function wrapSshpassInvocation(
  sshpassArgs: string[],
  env: NodeJS.ProcessEnv,
): { command: string; args: string[]; env: NodeJS.ProcessEnv } {
  if (usesWslSync()) {
    return {
      command: 'wsl.exe',
      args: ['-e', 'sshpass', ...sshpassArgs],
      env,
    };
  }
  return {
    command: 'sshpass',
    args: sshpassArgs,
    env,
  };
}

/** Parse ``ls -1`` output of remote modules dir into sorted module names. */
export function parseRemoteModulesListing(stdout: string): string[] {
  const names = String(stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((name) => Boolean(name) && !name.startsWith('.') && !name.includes('/'));
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

/**
 * List module folder names under ``/root/cleep-dev/modules`` on the device.
 */
export async function listRemoteDeveloperModules(options: {
  host: string;
  ssh: DeveloperSshSecret;
}): Promise<string[]> {
  await assertSyncToolsAvailable();
  const host = String(options.host || '').trim();
  if (!host) {
    throw new Error('Development device has no IP address');
  }
  const remote = `${options.ssh.username}@${host}`;
  const env = buildSshpassEnv(options.ssh);
  const wrapped = wrapSshpassInvocation(
    ['-e', 'ssh', ...buildSshPasswordArgs(), remote, `ls -1 ${DEVELOPER_SYNC_REMOTE_MODULES} 2>/dev/null || true`],
    env,
  );
  const result = await runSshpassCommand(wrapped.command, wrapped.args, wrapped.env);
  return parseRemoteModulesListing(result.stdout);
}

export const DEVELOPER_DEVICE_LOG_SPLIT = '__CLEEP_DEVICE_LOG__';

export type DeveloperDeviceLogTail = {
  /** Remote log byte size (``stat``), used to skip unchanged UI updates. */
  size: number;
  /** Last N lines of the log (may be empty). */
  content: string;
};

/** Parse combined ``stat`` + ``tail`` SSH payload. */
export function parseDeveloperDeviceLogPayload(stdout: string): DeveloperDeviceLogTail {
  const raw = String(stdout || '');
  const marker = `\n${DEVELOPER_DEVICE_LOG_SPLIT}\n`;
  const idx = raw.indexOf(marker);
  if (idx < 0) {
    // Fallback when the marker is missing (treat whole payload as content).
    return { size: 0, content: raw };
  }
  const size = Number.parseInt(raw.slice(0, idx).trim(), 10) || 0;
  const content = raw.slice(idx + marker.length);
  return { size, content };
}

/**
 * Fetch last lines of ``/var/log/cleep.log`` over SSH in one round-trip.
 */
export async function fetchDeveloperDeviceLogTail(options: {
  host: string;
  ssh: DeveloperSshSecret;
  lines?: number;
}): Promise<DeveloperDeviceLogTail> {
  await assertSyncToolsAvailable();
  const host = String(options.host || '').trim();
  if (!host) {
    throw new Error('Development device has no IP address');
  }
  const lines = Math.max(1, Math.min(2000, Number(options.lines) || DEVELOPER_DEVICE_LOG_LINES));
  const remote = `${options.ssh.username}@${host}`;
  const remoteCmd = [
    `stat -c%s ${DEVELOPER_DEVICE_LOG_PATH} 2>/dev/null || echo 0`,
    `echo ${DEVELOPER_DEVICE_LOG_SPLIT}`,
    `tail -n ${lines} ${DEVELOPER_DEVICE_LOG_PATH} 2>/dev/null || true`,
  ].join('; ');

  const env = buildSshpassEnv(options.ssh);
  const wrapped = wrapSshpassInvocation(
    ['-e', 'ssh', ...buildSshPasswordArgs(), remote, remoteCmd],
    env,
  );
  const result = await runSshpassCommand(wrapped.command, wrapped.args, wrapped.env);
  return parseDeveloperDeviceLogPayload(result.stdout);
}

function appendTransferArgs(
  rsyncArgs: string[],
  local: string,
  remote: string,
  direction: DeveloperSyncDirection,
): void {
  if (direction === 'pull') {
    rsyncArgs.push(remote, local);
  } else {
    rsyncArgs.push(local, remote);
  }
}

export function buildRsyncCommand(
  host: string,
  ssh: DeveloperSshSecret,
  target: RsyncAppTarget,
  direction: DeveloperSyncDirection = 'push',
): { command: string; args: string[]; env: NodeJS.ProcessEnv } {
  const localNative = target.localPath.endsWith(path.sep)
    ? target.localPath
    : `${target.localPath}${path.sep}`;
  const local = toSyncLocalPath(localNative);
  const remotePath = `${DEVELOPER_SYNC_REMOTE_MODULES}/${target.moduleName}/`;
  const remote = buildSshDestination(host, ssh.username, remotePath);

  const rsyncArgs = ['-az', '--delete'];
  for (const pattern of RSYNC_EXCLUDES) {
    rsyncArgs.push('--exclude', pattern);
  }
  rsyncArgs.push('-e', buildSshRemoteShellCommand());
  appendTransferArgs(rsyncArgs, local, remote, direction);

  const env = buildSshpassEnv(ssh);
  return wrapSshpassInvocation(['-e', 'rsync', ...rsyncArgs], env);
}

/**
 * Build rsync for Cleep core ↔ /root/cleep-dev/.
 * Always excludes ``modules/`` before --delete so remote/local modules stay untouched.
 * Allowlists known dirs/files; everything else at the root is skipped.
 */
export function buildCoreRsyncCommand(
  host: string,
  ssh: DeveloperSshSecret,
  localCorePath: string,
  direction: DeveloperSyncDirection = 'push',
): { command: string; args: string[]; env: NodeJS.ProcessEnv } {
  const localNative = localCorePath.endsWith(path.sep)
    ? localCorePath
    : `${localCorePath}${path.sep}`;
  const local = toSyncLocalPath(localNative);
  const remote = buildSshDestination(
    host,
    ssh.username,
    `${DEVELOPER_SYNC_REMOTE_ROOT}/`,
  );

  // Exclude modules first so --delete never removes apps under modules/.
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
  rsyncArgs.push('-e', buildSshRemoteShellCommand());
  appendTransferArgs(rsyncArgs, local, remote, direction);

  const env = buildSshpassEnv(ssh);
  return wrapSshpassInvocation(['-e', 'rsync', ...rsyncArgs], env);
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

/**
 * Serialize all sshpass traffic to the Pi.
 * Startup used to fire one rsync SSH per app in parallel (+ optional remote ls),
 * which trips sshd MaxStartups (``Connection reset by peer`` / rsync 255).
 */
let developerSshLock: Promise<void> = Promise.resolve();

function withDeveloperSshLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = developerSshLock.then(fn, fn);
  developerSshLock = run.then(
    (): void => undefined,
    (): void => undefined,
  );
  return run;
}

function runSshpassCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string }> {
  return withDeveloperSshLock(async () => {
    await ensureDeveloperSshControlDir();
    return runCommand(command, args, env);
  });
}

function runCommandStreaming(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  onOutput: (chunk: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      windowsHide: true,
    });
    let tail = '';
    const append = (chunk: Buffer | string) => {
      const text = String(chunk);
      onOutput(text);
      tail = (tail + text).slice(-4000);
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    child.on('error', (error) => {
      reject(error);
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const detail = (tail || `exit code ${code}`).trim();
      reject(new Error(detail || `Command failed: ${command}`));
    });
  });
}

function runSshpassCommandStreaming(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  onOutput: (chunk: string) => void,
): Promise<void> {
  return withDeveloperSshLock(async () => {
    await ensureDeveloperSshControlDir();
    return runCommandStreaming(command, args, env, onOutput);
  });
}

/**
 * Install Python dependencies from the synced ``requirements.txt`` on the device.
 * Optionally also installs ``requirements-test.txt``. Streams stdout/stderr via ``onOutput``.
 */
export async function installDeveloperRequirements(options: {
  host: string;
  ssh: DeveloperSshSecret;
  includeTest?: boolean;
  onOutput: (chunk: string) => void;
}): Promise<void> {
  await assertSyncToolsAvailable();
  const host = String(options.host || '').trim();
  if (!host) {
    throw new Error('Development device has no IP address');
  }
  const remote = `${options.ssh.username}@${host}`;
  const reqPath = DEVELOPER_REQUIREMENTS_REMOTE_PATH;
  const testPath = DEVELOPER_REQUIREMENTS_TEST_REMOTE_PATH;
  const includeTest = Boolean(options.includeTest);
  const pipInstall =
    `PYTHONUNBUFFERED=1 python3 -m pip install --no-cache-dir` +
    ` --trusted-host pypi.org --trusted-host files.pythonhosted.org --trusted-host pypi.python.org`;
  const remoteCmdParts = [
    `test -f ${reqPath} || { echo "requirements.txt not found at ${reqPath} (sync Cleep core first)" >&2; exit 1; }`,
    `echo "Installing dependencies from ${reqPath}..."`,
    // Match device preinst: system pip + trusted hosts; unbuffered for live logs.
    `${pipInstall} -r ${reqPath}`,
  ];
  if (includeTest) {
    remoteCmdParts.push(
      `test -f ${testPath} || { echo "requirements-test.txt not found at ${testPath} (sync Cleep core first)" >&2; exit 1; }`,
      `echo "Installing test dependencies from ${testPath}..."`,
      `${pipInstall} -r ${testPath}`,
    );
  }

  const env = buildSshpassEnv(options.ssh);
  const wrapped = wrapSshpassInvocation(
    ['-e', 'ssh', ...buildSshPasswordArgs(), remote, remoteCmdParts.join('; ')],
    env,
  );
  await runSshpassCommandStreaming(
    wrapped.command,
    wrapped.args,
    wrapped.env,
    options.onOutput,
  );
}

export async function rsyncDeveloperApps(options: {
  host: string;
  ssh: DeveloperSshSecret;
  apps: DeveloperAppEntry[];
  direction?: DeveloperSyncDirection;
}): Promise<void> {
  await assertSyncToolsAvailable();
  const host = String(options.host || '').trim();
  if (!host) {
    throw new Error('Development device has no IP address');
  }
  if (!options.apps.length) {
    throw new Error('No applications selected for sync');
  }
  const direction = options.direction || 'push';

  const targets = options.apps.filter((app) => app.valid && app.moduleName);
  if (!targets.length) {
    throw new Error('No valid applications to sync');
  }

  // One SSH at a time — parallel rsync storms reset sshd on the Pi.
  for (const app of targets) {
    const cmd = buildRsyncCommand(
      host,
      options.ssh,
      {
        localPath: app.absolutePath,
        moduleName: app.moduleName!,
      },
      direction,
    );
    appLogger.info('Developer sync rsync', {
      moduleName: app.moduleName,
      localPath: app.absolutePath,
      host,
      direction,
    });
    await runSshpassCommand(cmd.command, cmd.args, cmd.env);
  }
}

export async function rsyncDeveloperCore(options: {
  host: string;
  ssh: DeveloperSshSecret;
  localCorePath: string;
  direction?: DeveloperSyncDirection;
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
  const direction = options.direction || 'push';

  const cmd = buildCoreRsyncCommand(host, options.ssh, localCorePath, direction);
  appLogger.info('Developer sync rsync core', {
    localPath: localCorePath,
    remoteRoot: DEVELOPER_SYNC_REMOTE_ROOT,
    host,
    direction,
  });
  await runSshpassCommand(cmd.command, cmd.args, cmd.env);
}
