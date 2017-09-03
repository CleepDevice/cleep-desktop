rmdir /Q /S %2\etcher-cli
tools\7z\7za.exe x %1 -o"%2\etcher-cli" -aoa
copy scripts\etcher-cli.windows.bat %2\etcher-cli\
