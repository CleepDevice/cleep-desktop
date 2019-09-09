@echo off

::params:
:: %1 : archive fullpath
:: %2 : application path
:: %3 : install path

if exist "%3\etcher-cli" rmdir /Q /S %3\etcher-cli
if exist "%3\balena-cli" rmdir /Q /S %3\balena-cli
%2\tools\7z\7za.exe x %1 -o"%3\" -aoa
copy %2\tools\flash.windows.bat %3\balena-cli\flash.bat
