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
echo
echo "Packaging cleepremote..."
echo "------------------------"
pyinstaller --clean --noconfirm --noupx --windowed --debug --log-level INFO cleepremote.spec
move dist\cleepremote %CLEEPDESKTOPPATH%

:: copy files and dirs
echo
echo "Copying release files..."
echo "------------------------"
copy /Y html %CLEEPDESKTOPPATH%
copy /Y LICENCE.txt %CLEEPDESKTOPPATH%
copy /Y main.js %CLEEPDESKTOPPATH%
copy /Y package.json %CLEEPDESKTOPPATH%
copy /Y README.md %CLEEPDESKTOPPATH%
copy /Y resources %CLEEPDESKTOPPATH%
echo "Done"

:: electron-builder
echo
echo "Packaging cleepdesktop..."
echo "-------------------------"
node_modules\.bin\electron-builder --windows --x64 --projectDir %CLEEPDESKTOPPATH%

#cleaning
echo
echo "Finalizing..."
echo "-------------"
ping 127.0.0.1 -n 2 > nul
move %CLEEPDESKTOPPATH%\dist .
rmdir -/Q /S build
rmdir -/Q /S __pycache__
rmdir -/Q /S cleep/__pycache__
rmdir -/Q /S cleep/libs/__pycache__

echo "Done"

