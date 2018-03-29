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
echo
echo "Packaging cleepdesktopcore..."
echo "-----------------------------"
/bin/cp config/cleepdesktopcore-mac32.spec cleepdesktopcore-mac32.spec
/usr/local/bin/pyinstaller --clean --noconfirm --noupx --debug --log-level INFO cleepdesktopcore-mac32.spec
/bin/rm cleepdesktopcore-mac32.spec
/bin/mv dist/cleepdesktopcore "$CLEEPDESKTOPPATH"

#copy files and dirs
echo
echo
echo "Copying release files..."
echo "------------------------"
/bin/cp -a html "$CLEEPDESKTOPPATH"
/bin/cp -a LICENSE.txt "$CLEEPDESKTOPPATH"
/bin/cp -a cleepdesktop.js "$CLEEPDESKTOPPATH"
/bin/cp -a package.json "$CLEEPDESKTOPPATH"
/bin/cp -a README.md "$CLEEPDESKTOPPATH"
/bin/cp -a resources "$CLEEPDESKTOPPATH"
echo "Done"

#electron-builder
echo
echo
if [ "$1" == "publish" ]
then
    echo "Publishing cleepdesktop..."
    echo "--------------------------"
    GH_TOKEN=$GH_TOKEN_CLEEPDESKTOP node_modules/.bin/electron-builder --mac --ia32 --projectDir "$CLEEPDESKTOPPATH" --publish onTagOrDraft
else
    echo "Packaging cleepdesktop..."
    echo "-------------------------"
    node_modules/.bin/electron-builder --mac --ia32 --projectDir "$CLEEPDESKTOPPATH"
fi

#cleaning
echo
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

echo
echo "Build result in dist/ folder"