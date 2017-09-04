@echo off
:: variables
set "CLEEPDESKTOPPATH=build\cleepdesktop_tree"

:: clear previous process files
rmdir /Q /S dist
rmdir /Q /S build

:: create dirs
mkdir %CLEEPDESKTOPPATH%
mkdir dist

:: pyinstaller
echo.
echo.
echo Packaging cleepremote...
echo ------------------------
pyinstaller --clean --noconfirm --noupx --windowed --debug --log-level INFO cleepremote.windows.spec
move dist\cleepremote %CLEEPDESKTOPPATH%

:: copy files and dirs
echo.
echo.
echo Copying release files...
echo ------------------------
echo html...
mkdir %CLEEPDESKTOPPATH%\html
xcopy /S html %CLEEPDESKTOPPATH%\html
xcopy LICENCE.txt %CLEEPDESKTOPPATH%\
xcopy main.js %CLEEPDESKTOPPATH%\
xcopy package.json %CLEEPDESKTOPPATH%\
xcopy README.md %CLEEPDESKTOPPATH%\
mkdir %CLEEPDESKTOPPATH%\resources
xcopy /S resources %CLEEPDESKTOPPATH%\resources
echo Done

:: electron-builder
echo.
echo.
echo Packaging cleepdesktop...
echo -------------------------
:: electron-builder is launched in other command line because it stop this script at end of process
:: to debug electron-builder uncomment line below
:: set DEBUG=electron-builder,electron-builder:*
cmd /C "node_modules\.bin\electron-builder --windows --x64 --projectDir %CLEEPDESKTOPPATH%"

:: cleaning
echo.
echo.
echo Finalizing...
echo -------------
ping 127.0.0.1 -n 2 > nul
mkdir dist
xcopy /S %CLEEPDESKTOPPATH%\dist dist
rmdir /Q /S build
rmdir /Q /S __pycache__
rmdir /Q /S cleep\__pycache__
rmdir /Q /S cleep\libs\__pycache__
echo Done

