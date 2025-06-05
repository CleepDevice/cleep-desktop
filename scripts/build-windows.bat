@echo off
:: variables
set "CLEEPDESKTOPPATH=packaging\cleepdesktop_tree"

:: clear previous process files
rmdir /Q /S dist
rmdir /Q /S packaging

:: create dirs
mkdir %CLEEPDESKTOPPATH%

:: electron
echo.
echo.
echo Building electron app...
echo ------------------------
call npm ci
if %ERRORLEVEL% NEQ 0 goto :error
cmd /C "node_modules\.bin\tsc --outDir %CLEEPDESKTOPPATH%"
if %ERRORLEVEL% NEQ 0 goto :error
echo Done

:: copy files and dirs
echo.
echo.
echo Copying release files...
echo ------------------------
echo html...
mkdir %CLEEPDESKTOPPATH%\html
xcopy /S html %CLEEPDESKTOPPATH%\html
mkdir %CLEEPDESKTOPPATH%\resources
xcopy /S resources %CLEEPDESKTOPPATH%\resources
xcopy LICENSE.txt %CLEEPDESKTOPPATH%\
xcopy package.json %CLEEPDESKTOPPATH%\
xcopy README.md %CLEEPDESKTOPPATH%\
echo Done

:: electron-builder
echo.
echo.
:: to debug electron-builder uncomment line below
:: set DEBUG=electron-builder,electron-builder:*
if "%1" == "publish" (
    echo Publishing cleepdesktop...
    echo --------------------------
    set "GH_TOKEN=%GH_TOKEN_CLEEPDESKTOP%"
    cmd /C "node_modules\.bin\electron-builder --windows --x64 --projectDir %CLEEPDESKTOPPATH% --publish always"
    if %ERRORLEVEL% NEQ 0 goto :error
) else (
    echo Packaging cleepdesktop...
    echo -------------------------
    cmd /C "node_modules\.bin\electron-builder --windows --x64 --projectDir %CLEEPDESKTOPPATH% --publish never"
    if %ERRORLEVEL% NEQ 0 goto :error
)

:: finalizing moving generated stuff to dist directory and removing temp stuff
echo.
echo.
echo Finalizing...
echo -------------
ping 127.0.0.1 -n 2 > nul
mkdir dist
xcopy /Q /S %CLEEPDESKTOPPATH%\dist dist
if "%1" == "publish" (
    rmdir /Q /S packaging
)
rmdir /Q /S __pycache__
rmdir /Q /S core\__pycache__
rmdir /Q /S core\libs\__pycache__
rmdir /Q /S core\modules\__pycache__
echo Done

echo.
echo Build result in dist/ folder
cd dist
dir

goto :done

:error
echo ===== Error occured see above =====
exit /b 1

:done
echo ===== Success =====