@echo off
setlocal EnableExtensions
:: params:
:: %1: rpi-imager install dir
:: %2: drive path
:: %3: image filepath
:: %4: optional first-run script (passed to rpi-imager --first-run-script)

set "RPI_DIR=%~1"
set "DRIVE=%~2"
set "IMAGE=%~3"
set "FIRST_RUN_SCRIPT=%~4"
set "LOGFILE=%RPI_DIR%\flash-tool.log"
set "IMAGER=%RPI_DIR%\rpi-imager.exe"

echo START %date% %time% >> "%LOGFILE%"
echo params=%RPI_DIR% %DRIVE% %IMAGE% %FIRST_RUN_SCRIPT% >> "%LOGFILE%"

if "%FIRST_RUN_SCRIPT%"=="" (
  "%IMAGER%" --cli "%IMAGE%" "%DRIVE%"
) else (
  "%IMAGER%" --cli --first-run-script "%FIRST_RUN_SCRIPT%" "%IMAGE%" "%DRIVE%"
)
set "RET=%ERRORLEVEL%"
echo rpi-imager returncode=%RET% >> "%LOGFILE%"
echo END %date% %time% >> "%LOGFILE%"
exit /b %RET%
