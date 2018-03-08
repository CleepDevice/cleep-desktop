@echo off

::params:
:: %1 : archive fullpath
:: %2 : application path
:: %3 : install path

if exist "%3\etcher-cli" rmdir /Q /S %3\etcher-cli
%2\tools\7z\7za.exe x %1 -o"%3\etcher-cli" -aoa
xcopy %2\tools\etcher-cli.windows.bat %3\etcher-cli\
