# Changelog

## [Unreleased]

### Changed
- Replace ``node-wifi`` with direct OS wifi scan (``nmcli`` / ``netsh``; macOS current SSID via ``networksetup``)
- Windows wifi scan: UTF-8 via ``chcp 65001`` + FR/EN ``netsh`` field labels
- macOS wifi scan: try ``airport -s``, fall back to ``system_profiler SPAirPortDataType``; spinner while scanning
- Host wifi integration tests on CI matrix (soft checks against real OS tools)
- Drop legacy ``config/notarize.js`` / ``@electron/notarize``; rely on electron-builder built-in notarytool (``APPLE_ID`` / API key env vars) when Developer ID secrets exist
- Bump Electron 44.7 → 45.2 and refresh npm deps (Sentry 8.3, electron-builder, vitest, axios, …)

### Fixed
- Wifi install dialog: hide network dropdown when scan is empty; prefill SSID from current association; clearer note for Win11 Location permission / macOS scan limits
- Wire Sentry for both Electron main and AngularJS renderer (opt-in crash reports)
- Apply live ``parameters.auth.update``: refresh device lock icon without reconnect; defer login while the device page stays open
- Device details: Raspberry Pi revision codes + board images (incl. Pi 500+, CM5 16GB, Pi5 1GB)
- Support page: warmer layout (lead + action cards); Slack → Discord; drop forum duplicate
- Toolbar headers stay 64px (match devices panel; flex + h1 margins no longer stretch them)
- Help page: sections + grey note cards (Cleep image on intro); config-note supports cl-img-src
- Load config/ui component scripts (and support controller) so Desktop pages render after design-system migration
- Offline devices with auth always show ``cellphone-off`` (auth lock no longer hides the disconnected state)
- Refresh peer hostname (and related identity fields) on reconnect; apply live ``parameters.hostname.update``
- Do not prompt vault unlock at startup when caching gateway/refresh secrets from the bus (queue until unlock / user action)
- Ngrok free interstitial again after gateway headers (single ``onBeforeSendHeaders``: skip + Auth/Target)
- Device infos menu crashes when peer has no ``extra`` (disable action; guard filter)

### Added
- Implement internal vault to store keys
- Live `core.remoteaccess.update` handling: force-update peer remote URLs without reconnection
- Remote devices section in the left panel (open device via public URL)
- Off-LAN remote URL refresh via provider descriptor (vault secret + error-page / menu action)
- Desktop-only LAN gateway: vault gateway token, header injection, single device list (icon for gateway access)

### Changed

- Devices panel: single list sorted by hostname (drop Unconfigured / Configured sections)
- Progress-stream lib replaced by internal code (outdated since 2017)
- Update Electron from 36 to 41
- Replace eslint by oxlint
- Replace extract-zip by unzipper (outdated since 2020)
- Replace python cleepbus by pyre-ts
- Improve sdcard flash (and remove legacy lib)
- Improve flash card tool

### Added

- Unit tests (~93% coverage)
- Implements hot-reload for developments
- Add way to choose network interface in case of exotic network

## [0.3.0] - 2024-02-28

### Changed

- Improve logging
- Bump dependencies (electron23->33)
- Handle deprecation error on balena-cli
- Update balena-cli version
- Improve Cleepbus UI infos
- Update github repo urls

### Fixed

- External link from device does not open browser
- Issue saving changelog
- Fix macos CircleCi config
- Fix bug deleting device in devices panel
- Fix UI issue when iso download failed
- Fix issu when wifi file not specified during flash

### Added

- Handle self-sign certificate
- Handle Cleep device auth
- Kill Cleepbus previous instances
- Relaunch Cleepbus when it crashs

## [0.2.0] - 2022-09-08

### Changed

- Move all logic previously in angularjs to electron
- Remove cleepbus from cleepdesktop as external binary
- Clean angularjs code
- Rewrite most of electron source code
- Bump electron to latest v20
- Bump dependencies

## [0.1.5] - 2022-02-05

### Fixed

- Fix monitoring: messages were not displayed
- Fix monitoring: messages were not catched at application startup
- Fix device command sending
- Fix local iso dialog that doesn't open

### Changed

- Display monitoring message details
- Limit number of monitoring messages in list
- Add button to clear monitoring messages
- Add unique network identifier to cleep-desktop like other devices
- Implement basics for device command sending
- Update ts libs (electron v13.X)
- Update python libs

## [0.1.4] - 2021-05-18

### Fixed

- Improve device page cache handling
- Re-fix hide changelog button when downloading update
- Fix local iso file selection
- Fix local iso file download notification

### Changes

- Update librairies
- Fix electron deprecation warning (remote)

## [0.1.3] - 2021-05-01

### Fixed

- Fix devices list when device has Cleep reinstalled (it appeared twice)
- Hide changelog button when updating Cleep
- Change selected device list item color (less "red" that confuses with an error)
- Fix first run dialog close button that doesn't work
- Fix help page issues
- Bump electron 12.0.6
- Fix build for macos

## [0.1.2] - 2021-04-29

### Fixed

- No mac addresses found under windows
- Change zipped log file extension to allow system to open file directly
- Do not display other cleep-desktop connection in device list
- New device not displayed on first connection
- Trigger fatal error when cleepdesktopcore binary not found
- Handle case when connection to cleepbus failed

## [0.1.1] - 2021-04-25

### Fixed

- Fix problems opening logs
- Fix error retrieving wireless interfaces when no wifi adapter under windows

## [0.1.0] - 2021-04-19

### Changed

- Electron code migrated to typescript
- Bump major libs (python, angularjs, electron)
- Update build/publish scripts after major pyinstaller update
- Detect raspios images instead of deprecated raspbians ones
- Core modules updates according to cleep changes

### Fixed

- Fix cleep-os releases detection
