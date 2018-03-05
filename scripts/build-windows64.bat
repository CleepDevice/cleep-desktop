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
echo Packaging cleepdesktopcore...
echo -----------------------------
xcopy /Q /Y config\cleepdesktopcore-windows64.spec .
pyinstaller --clean --noconfirm --noupx --windowed --debug --log-level INFO cleepdesktopcore-windows64.spec
del /Q cleepdesktopcore-windows64.spec
move dist\cleepdesktopcore %CLEEPDESKTOPPATH%

:: copy files and dirs
echo.
echo.
echo Copying release files...
echo ------------------------
echo html...
mkdir %CLEEPDESKTOPPATH%\html
xcopy /S html %CLEEPDESKTOPPATH%\html
xcopy LICENCE.txt %CLEEPDESKTOPPATH%\
xcopy cleepdesktop.js %CLEEPDESKTOPPATH%\
xcopy package.json %CLEEPDESKTOPPATH%\
xcopy README.md %CLEEPDESKTOPPATH%\
mkdir %CLEEPDESKTOPPATH%\resources
xcopy /S resources %CLEEPDESKTOPPATH%\resources
echo Done

echo.
echo.
echo "CleepDesktop built into %CLEEPDESKTOPPATH%"

