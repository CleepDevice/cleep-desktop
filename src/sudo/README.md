# Windows elevation helper

`elevate.exe` is required for Windows SD card flashing (admin rights).

It is copied into `build/sudo/` by `npm run copy:elevate-exe` during `npm run build`.

If this file is missing, Windows installs fail with a clear error from `Sudo`.
Restore the binary from the CleepDesktop release assets / packaging pipeline before shipping Windows builds.
