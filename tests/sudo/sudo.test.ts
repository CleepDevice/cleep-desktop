import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sudo } from '../../src/sudo/sudo';

vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    spawn: vi.fn(),
    spawnSync: vi.fn(),
  };
});

describe('Sudo', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Object.defineProperty(process, 'platform', { configurable: true, value: 'linux' });
  });

  it('prefers run0 on linux when available', async () => {
    const { spawn, spawnSync } = await import('child_process');
    vi.mocked(spawnSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      if (cmd === 'which' && args?.[0] === 'run0') {
        return { status: 0, stdout: '/usr/bin/run0\n', stderr: '', pid: 1, output: [], signal: null } as never;
      }
      return { status: 1, stdout: '', stderr: '', pid: 1, output: [], signal: null } as never;
    });

    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: ReturnType<typeof vi.fn>;
      pid?: number;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    child.pid = 1;
    vi.mocked(spawn).mockReturnValue(child as never);

    const sudo = new Sudo({
      appName: 'CleepDesktop',
      terminatedCallback: vi.fn(),
      stdoutCallback: vi.fn(),
      stderrCallback: vi.fn(),
    });
    sudo.run('/bin/echo', ['hello']);

    expect(spawn).toHaveBeenCalledWith(
      '/usr/bin/run0',
      ['--description=CleepDesktop', '/bin/echo', 'hello'],
      expect.any(Object),
    );
  });

  it('runs command with linux sudo binary when available', async () => {
    const { spawn, spawnSync } = await import('child_process');
    vi.mocked(spawnSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      if (cmd === 'which' && args?.[0] === 'pkexec') {
        return { status: 0, stdout: '/usr/bin/pkexec\n', stderr: '', pid: 1, output: [], signal: null } as never;
      }
      return { status: 1, stdout: '', stderr: '', pid: 1, output: [], signal: null } as never;
    });

    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    child.pid = 4242;
    vi.mocked(spawn).mockReturnValue(child as never);

    const terminatedCallback = vi.fn();
    const stdoutCallback = vi.fn();
    const stderrCallback = vi.fn();
    const sudo = new Sudo({
      appName: 'Cleep"Desktop',
      terminatedCallback,
      stdoutCallback,
      stderrCallback,
    });

    sudo.run('/bin/echo', ['hello']);

    expect(spawn).toHaveBeenCalledWith(
      '/usr/bin/pkexec',
      expect.arrayContaining(['--disable-internal-agent', '/bin/echo', 'hello']),
      expect.any(Object),
    );

    child.stdout.emit('data', Buffer.from('out'));
    child.stderr.emit('data', Buffer.from('err'));
    child.emit('close', 0);

    expect(stdoutCallback).toHaveBeenCalledWith('out');
    expect(stderrCallback).toHaveBeenCalledWith('err');
    expect(terminatedCallback).toHaveBeenCalledWith(0);

    sudo.kill();
    expect(spawnSync).toHaveBeenCalledWith('pkill', ['-TERM', '-P', '4242']);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('throws when no linux sudo binary is found', async () => {
    const { spawnSync } = await import('child_process');
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: '',
      pid: 1,
      output: [],
      signal: null,
    } as never);

    const sudo = new Sudo({
      appName: 'CleepDesktop',
      terminatedCallback: vi.fn(),
      stdoutCallback: vi.fn(),
      stderrCallback: vi.fn(),
    });

    expect(() => sudo.run('/bin/true')).toThrow('No sudo binary found');
  });

  it('builds darwin osascript command with administrator privileges', async () => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'darwin' });
    const { spawn, spawnSync } = await import('child_process');
    vi.mocked(spawnSync).mockImplementation((cmd: string, args?: readonly string[]) => {
      if (cmd === 'which' && args?.[0] === 'osascript') {
        return { status: 0, stdout: '/usr/bin/osascript\n', stderr: '', pid: 1, output: [], signal: null } as never;
      }
      return { status: 1, stdout: '', stderr: '', pid: 1, output: [], signal: null } as never;
    });
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: ReturnType<typeof vi.fn> };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    vi.mocked(spawn).mockReturnValue(child as never);

    new Sudo({
      appName: 'CleepDesktop',
      terminatedCallback: vi.fn(),
      stdoutCallback: vi.fn(),
      stderrCallback: vi.fn(),
    }).run('/usr/local/bin/rpi-imager', ['--cli', '/tmp/image.img']);

    expect(spawn).toHaveBeenCalledWith(
      '/usr/bin/osascript',
      [
        '-e',
        'do shell script "\'/usr/local/bin/rpi-imager\' \'--cli\' \'/tmp/image.img\'" with administrator privileges',
      ],
      expect.any(Object),
    );
  });

  it('throws when darwin osascript binary is missing', async () => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'darwin' });
    const { spawnSync } = await import('child_process');
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: '',
      stderr: '',
      pid: 1,
      output: [],
      signal: null,
    } as never);

    const sudo = new Sudo({
      appName: 'CleepDesktop',
      terminatedCallback: vi.fn(),
      stdoutCallback: vi.fn(),
      stderrCallback: vi.fn(),
    });
    expect(() => sudo.run('/bin/true')).toThrow('No sudo binary found');
  });

  it('escapes double quotes in darwin shell command', async () => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'darwin' });
    const { spawn, spawnSync } = await import('child_process');
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '/usr/bin/osascript\n',
      stderr: '',
      pid: 1,
      output: [],
      signal: null,
    } as never);
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: ReturnType<typeof vi.fn> };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    vi.mocked(spawn).mockReturnValue(child as never);

    new Sudo({
      appName: 'CleepDesktop',
      terminatedCallback: vi.fn(),
      stdoutCallback: vi.fn(),
      stderrCallback: vi.fn(),
    }).run('/bin/echo', ['say "hello"']);

    const appleScript = vi.mocked(spawn).mock.calls[0][1]?.[1] as string;
    expect(appleScript).toContain('\\"hello\\"');
  });

  it('escapes single quotes in darwin shell args', async () => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'darwin' });
    const { spawn, spawnSync } = await import('child_process');
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '/usr/bin/osascript\n',
      stderr: '',
      pid: 1,
      output: [],
      signal: null,
    } as never);
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: ReturnType<typeof vi.fn> };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    vi.mocked(spawn).mockReturnValue(child as never);

    new Sudo({
      appName: 'CleepDesktop',
      terminatedCallback: vi.fn(),
      stdoutCallback: vi.fn(),
      stderrCallback: vi.fn(),
    }).run('/bin/echo', ["it's"]);

    const appleScript = vi.mocked(spawn).mock.calls[0][1]?.[1] as string;
    expect(appleScript).toContain(`'it'\\''s'`);
  });

  it('kills darwin elevated process via pkill then SIGTERM', async () => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'darwin' });
    const { spawn, spawnSync } = await import('child_process');
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: '/usr/bin/osascript\n',
      stderr: '',
      pid: 1,
      output: [],
      signal: null,
    } as never);
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: ReturnType<typeof vi.fn>;
      pid?: number;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    child.pid = 7777;
    vi.mocked(spawn).mockReturnValue(child as never);

    const sudo = new Sudo({
      appName: 'CleepDesktop',
      terminatedCallback: vi.fn(),
      stdoutCallback: vi.fn(),
      stderrCallback: vi.fn(),
    });
    sudo.run('/bin/true');
    sudo.kill();

    expect(spawnSync).toHaveBeenCalledWith('pkill', ['-TERM', '-P', '7777']);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('builds windows elevate command with batch files', async () => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
    const { spawn } = await import('child_process');
    const elevateSrc = path.join(__dirname, '../../src/sudo/elevate.exe');
    // ensure source path exists for copy (create dummy if missing in env)
    const sudoDir = path.dirname(elevateSrc);
    fs.mkdirSync(sudoDir, { recursive: true });
    if (!fs.existsSync(elevateSrc)) {
      fs.writeFileSync(elevateSrc, 'dummy');
    }

    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    vi.mocked(spawn).mockReturnValue(child as never);

    const sudo = new Sudo({
      appName: 'CleepDesktop',
      terminatedCallback: vi.fn(),
      stdoutCallback: vi.fn(),
      stderrCallback: vi.fn(),
    });
    sudo.run('C:\\Program Files\\tool.exe', ['hello world']);

    expect(spawn).toHaveBeenCalledWith(
      expect.stringContaining('elevate.exe'),
      expect.arrayContaining(['-wait']),
      expect.any(Object),
    );

    const batchFiles = fs.readdirSync(os.tmpdir()).filter((file) => file.startsWith('sudo-command-'));
    expect(batchFiles.length).toBeGreaterThan(0);
    const batchContent = fs.readFileSync(path.join(os.tmpdir(), batchFiles[0]), 'utf8');
    expect(batchContent).toContain('"C:\\Program Files\\tool.exe"');

    sudo.kill();
    // cleanup generated batch files in temp
    for (const file of fs.readdirSync(os.tmpdir())) {
      if (file.startsWith('sudo-command-') || file.startsWith('sudo-output-') || file === 'elevate.exe') {
        fs.rmSync(path.join(os.tmpdir(), file), { force: true });
      }
    }
  });
});
