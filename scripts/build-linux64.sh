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
echo "Packaging cleepdesktopcore..."
echo "-----------------------------"
/bin/cp config/cleepdesktopcore-linux64.spec .
/usr/local/bin/pyinstaller --clean --noconfirm --noupx --debug --log-level INFO cleepdesktopcore-linux64.spec
/bin/rm cleepdesktopcore-linux64.spec
/bin/mv dist/cleepdesktopcore "$CLEEPDESKTOPPATH"

#copy files and dirs
echo
echo "Copying release files..."
echo "------------------------"
/bin/cp -a html "$CLEEPDESKTOPPATH"
/bin/cp -a LICENCE.txt "$CLEEPDESKTOPPATH"
/bin/cp -a cleepdesktop.js "$CLEEPDESKTOPPATH"
/bin/cp -a package.json "$CLEEPDESKTOPPATH"
/bin/cp -a README.md "$CLEEPDESKTOPPATH"
/bin/cp -a resources "$CLEEPDESKTOPPATH"
echo "Done"

echo
echo "CleepDesktop built into $CLEEPDESKTOPPATH"

