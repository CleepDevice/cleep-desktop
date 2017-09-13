@echo off

::params:
:: $1 : archive fullpath
:: $2 : install path

if exist "%2\etcher-cli" rmdir /Q /S %2\etcher-cli
%2\tools\7z\7za.exe x %1 -o"%2\etcher-cli" -aoa
xcopy %2\scripts\etcher-cli.windows.bat %2\etcher-cli\
