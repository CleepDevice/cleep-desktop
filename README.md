![256x256.png](https://github.com/CleepDevice/CleepDesktop/blob/master/resources/256x256.png)

# Welcome to CleepDesktop

CleepDesktop is a cross-platform desktop application that helps user to easily detect, configure and monitor its Cleep devices.

## Quick start

Download latest CleepDesktop release from https://github.com/CleepDevice/CleepDesktop/releases for your desktop environment and install it.
During first application launch, CleepDesktop will download necessary tools automatically.

> For linux users it is advised of installing [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher) to properly handle your AppImages.

## How it works

CleepDesktop discovers Cleep devices on user network and add quick access buttons to configure it.

Application main window is separated in 2 parts:

- The left panel displays list of discovered devices (configured and unconfigured ones)
- The right panel displays selected Cleep device configuration panels and CleepDesktop configurations panels.

## Features

### SD card burning

CleepDesktop downloads Raspberry Pi Imager on first launch (not bundled in the installer) and searches for the latest Cleep OS release, so users can install Cleep in a few clicks. Optional Wi‑Fi pre-configuration is supported for wireless devices.

Raspberry Pi Imager binaries are packaged separately as release assets (`rpi-imager-*.zip`) via `npm run package:rpi-imager` / `scripts/package-rpi-imager.sh`, then published under a `rpi-imager-vX.Y.Z` tag on this repository. Per-platform official source versions are set in `src/flash-tool/rpi-imager-versions.json` (e.g. Linux can stay on an older release when AppImage is missing). Flash wrappers live in `resources/flashtool/` and ship with the app. Wi-Fi (and future `cleep-*.json` payloads) are injected via rpi-imager `--first-run-script` — no post-flash mount/patch of the card.

The AngularJS UI runs with `nodeIntegration: false`, `contextIsolation: true`, and a sandboxed preload. It talks to the main process only through `window.cleep.ipc` exposed by `src/preload.ts`.

IPC channels and payloads are defined in `src/ipc/ipc-contract.ts` (typed request/response maps). Runtime allowlists live in `src/ipc/ipc-channels.ts` and are checked for exhaustiveness against that contract. Main-process helpers `handleInvoke` / `onRendererSend` / `sendToRenderer` in `src/ipc/ipc-main.ts` enforce those types at compile time.

Every `invoke` response uses a uniform envelope (`src/ipc/ipc-result.ts`): `{ ok: true, data }` or `{ ok: false, error: { code, message } }`. The Angular `electronService.sendReturn` unwraps it (resolves `data`, rejects `error`). Push events (main → renderer) stay channel + payload as before.

The preload is bundled with esbuild (`npm run build:preload`) because a sandboxed preload cannot `require()` local modules.

### Auto update

CleepDesktop checks for available updates at startup and install it automatically.

### Device monitoring

Devices messages like temperature updates, motion detection, voice recognition detected hotword, etc... can be viewed on dedicated page.

### Community

Direct access to community tools (slack, isntagram) and latest messages from community.

## License

This application is free and open source (MIT license) and it's based on Electron and Python3.
