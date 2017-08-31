#!/bin/bash

#env
CURRENTPATH=`pwd`

#clear previous process
rm -rf dist/
rm -rf build/

#pyinstaller
echo
echo "Pyinstaller cleepremote..."
/usr/local/bin/pyinstaller --clean --noconfirm --noupx --windowed --debug --log-level INFO cleepremote.spec
/bin/mv dist/cleepremote .

#electron-builder
echo
echo "Packaging cleepdesktop..."
/usr/bin/electron-builder --linux --x64

#cleaning
echo
echo "Cleaning..."
/bin/rm -rf build
/bin/rm -rf cleepremote
/bin/rm -rf __pycache__
/bin/rm -rf cleep/__pycache__

echo
echo "Done"
