#!/bin/bash

#env
CURRENTPATH=`pwd`
CLEEPDESKTOPPATH=build/cleepdesktop_tree

#clear previous process
/bin/rm -rf dist/
/bin/rm -rf build/

#create dirs
/bin/mkdir -p "$CLEEPDESKTOPPATH"
/bin/mkdir dist

#pyinstaller
echo
echo "Packaging cleepremote..."
echo "------------------------"
/usr/local/bin/pyinstaller --clean --noconfirm --noupx --debug --log-level INFO cleepremote.spec
/bin/mv dist/cleepremote "$CLEEPDESKTOPPATH"

#copy files and dirs
echo
echo "Copying release files..."
echo "------------------------"
/bin/cp -a html "$CLEEPDESKTOPPATH"
/bin/cp -a LICENCE.txt "$CLEEPDESKTOPPATH"
/bin/cp -a main.js "$CLEEPDESKTOPPATH"
/bin/cp -a package.json "$CLEEPDESKTOPPATH"
/bin/cp -a README.md "$CLEEPDESKTOPPATH"
/bin/cp -a resources "$CLEEPDESKTOPPATH"
echo "Done"

#electron-builder
echo
echo "Packaging cleepdesktop..."
echo "-------------------------"
/usr/bin/electron-builder --linux --x64 --projectDir "$CLEEPDESKTOPPATH"

#cleaning
echo
echo "Finalizing..."
echo "-------------"
/bin/sleep 1
/bin/mv "./$CLEEPDESKTOPPATH/dist" .
/bin/rm -rf build
/bin/rm -rf __pycache__
/bin/rm -rf cleep/__pycache__
/bin/rm -rf cleep/libs/__pycache__

echo "Done"

