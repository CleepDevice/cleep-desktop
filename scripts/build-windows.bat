@echo off
setlocal EnableExtensions

:: variables
set "CLEEPDESKTOPPATH=packaging\cleepdesktop_tree"

:: clear previous process files
if exist dist rmdir /Q /S dist
if exist packaging rmdir /Q /S packaging

:: create dirs
mkdir %CLEEPDESKTOPPATH%

:: electron app (tsc + preload + assets)
echo.
echo.
echo Building electron app...
echo ------------------------
call npm ci
if %ERRORLEVEL% NEQ 0 goto :error
call npm run build
if %ERRORLEVEL% NEQ 0 goto :error
echo Done

:: assemble packaging tree for electron-builder
echo.
echo.
echo Copying release files...
echo ------------------------
xcopy /E /I /Y /Q build %CLEEPDESKTOPPATH%
xcopy /E /I /Y /Q resources %CLEEPDESKTOPPATH%\resources
xcopy /Y /Q LICENSE.txt %CLEEPDESKTOPPATH%\
xcopy /Y /Q README.md %CLEEPDESKTOPPATH%\
echo Done

:: electron-builder
echo.
echo.
:: to debug electron-builder uncomment line below
:: set DEBUG=electron-builder,electron-builder:*
if "%1" == "publish" (
    echo Publishing cleepdesktop...
    echo --------------------------
    if not defined GH_TOKEN if defined GITHUB_TOKEN set "GH_TOKEN=%GITHUB_TOKEN%"
    if not defined GH_TOKEN if defined GH_TOKEN_CLEEPDESKTOP set "GH_TOKEN=%GH_TOKEN_CLEEPDESKTOP%"
    if not defined GH_TOKEN (
        echo Error occured: GH_TOKEN / GITHUB_TOKEN is required to publish.
        goto :error
    )
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
echo Done

echo.
echo Build result in dist/ folder
cd dist
dir
cd ..

goto :done

:error
echo ===== Error occured see above =====
exit /b 1

:done
echo ===== Success =====
endlocal
