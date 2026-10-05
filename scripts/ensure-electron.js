#!/usr/bin/env node
/**
 * Ensure the Electron binary is present after npm install.
 *
 * Newer npm may skip lifecycle scripts until allowScripts is approved.
 * Also, electron's own install.js uses extract-zip, which can hang/fail on
 * Node 24+/26 — fall back to system `unzip` or the unzipper package.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');

const electronRoot = path.dirname(require.resolve('electron/package.json'));
const { version } = require(path.join(electronRoot, 'package.json'));
const distDir = path.join(electronRoot, 'dist');
const pathTxt = path.join(electronRoot, 'path.txt');

function platformBinary() {
  switch (process.platform) {
    case 'darwin':
    case 'mas':
      return 'Electron.app/Contents/MacOS/Electron';
    case 'win32':
      return 'electron.exe';
    default:
      return 'electron';
  }
}

function isReady() {
  try {
    const expected = platformBinary();
    if (fs.readFileSync(pathTxt, 'utf8').trim() !== expected) {
      return false;
    }
    return fs.existsSync(path.join(distDir, expected));
  } catch {
    return false;
  }
}

function findCachedZip() {
  const cacheRoot = process.env.electron_config_cache || path.join(os.homedir(), '.cache', 'electron');
  if (!fs.existsSync(cacheRoot)) {
    return null;
  }
  const artifact = `electron-v${version}-${process.platform}-${process.arch}.zip`;
  const stack = [cacheRoot];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.name === artifact) {
        return full;
      }
    }
  }
  return null;
}

function downloadZip(destPath) {
  const url = `https://github.com/electron/electron/releases/download/v${version}/electron-v${version}-${process.platform}-${process.arch}.zip`;
  console.log(`[ensure-electron] Downloading ${url}`);
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const get = (target) => {
      https
        .get(target, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            get(res.headers.location);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`Download failed with HTTP ${res.statusCode}`));
            return;
          }
          res.pipe(file);
          file.on('finish', () => file.close(() => resolve(destPath)));
        })
        .on('error', reject);
    };
    get(url);
  });
}

async function extractZip(zipPath) {
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });

  try {
    execFileSync('unzip', ['-qo', zipPath, '-d', distDir], { stdio: 'inherit' });
    return;
  } catch {
    // fall through to unzipper
  }

  const { Open } = require('unzipper');
  const directory = await Open.file(zipPath);
  await directory.extract({ path: distDir });
}

async function main() {
  if (isReady()) {
    return;
  }

  console.log(`[ensure-electron] Electron ${version} binary missing — repairing install`);
  let zipPath = findCachedZip();
  if (!zipPath) {
    zipPath = path.join(os.tmpdir(), `electron-v${version}-${process.platform}-${process.arch}.zip`);
    await downloadZip(zipPath);
  } else {
    console.log(`[ensure-electron] Using cache ${zipPath}`);
  }

  await extractZip(zipPath);
  fs.writeFileSync(pathTxt, platformBinary());

  if (!isReady()) {
    throw new Error('Electron binary still missing after repair');
  }
  console.log('[ensure-electron] Electron binary ready');
}

main().catch((error) => {
  console.error('[ensure-electron] Failed:', error.message || error);
  process.exit(1);
});
