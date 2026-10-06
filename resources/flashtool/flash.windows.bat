@echo off
setlocal EnableExtensions
:: params:
:: %1: rpi-imager install dir
:: %2: drive path
:: %3: image filepath
:: %4: optional wifi config file

set "RPI_DIR=%~1"
set "DRIVE=%~2"
set "IMAGE=%~3"
set "WIFI_FILE=%~4"
set "LOGFILE=%RPI_DIR%\flash-tool.log"
set "IMAGER=%RPI_DIR%\rpi-imager.exe"

echo START %date% %time% >> "%LOGFILE%"
echo params=%RPI_DIR% %DRIVE% %IMAGE% %WIFI_FILE% >> "%LOGFILE%"

"%IMAGER%" --cli "%IMAGE%" "%DRIVE%"
echo rpi-imager returncode=%ERRORLEVEL% >> "%LOGFILE%"
if %ERRORLEVEL% NEQ 0 (
  echo END %date% %time% >> "%LOGFILE%"
  exit /b %ERRORLEVEL%
)

if "%WIFI_FILE%"=="" GOTO :END

echo rescan > "%TEMP%\cleep-rescan.txt"
diskpart /s "%TEMP%\cleep-rescan.txt"
del "%TEMP%\cleep-rescan.txt"
ping 127.0.0.1 -n 3 > nul

for /f %%D in ('wmic volume get DriveLetter^, Label ^| find "boot"') do set "bootvolume=%%D"
echo bootvolume=%bootvolume% >> "%LOGFILE%"

copy /Y "%WIFI_FILE%" "%bootvolume%\cleep-network.conf" >> "%LOGFILE%"

:END
echo returncode=%ERRORLEVEL% >> "%LOGFILE%"
echo END %date% %time% >> "%LOGFILE%"
if %ERRORLEVEL% NEQ 0 ( exit /b %ERRORLEVEL% )
endlocal
