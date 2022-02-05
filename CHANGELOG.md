# Changelog

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
