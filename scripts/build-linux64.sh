#!/bin/bash

# env
CLEEPDESKTOPPATH=packaging/cleepdesktop_tree

# clear previous process
rm -rf dist/
rm -rf packaging/

# create dirs
mkdir -p "$CLEEPDESKTOPPATH"

# pyinstaller
echo
echo
echo "Packaging cleepdesktopcore..."
echo "-----------------------------"
python3 -m pip install -r requirements.txt
cp config/cleepdesktopcore-linux64.spec cleepdesktopcore-linux64.spec
python3 -m PyInstaller --workpath packaging --clean --noconfirm --noupx --debug all --log-level INFO cleepdesktopcore-linux64.spec
rm cleepdesktopcore-linux64.spec
echo "Generated files:"
ls -l dist/cleepdesktopcore
mv dist/cleepdesktopcore "$CLEEPDESKTOPPATH"

# electron
echo
echo
echo "Building electron app..."
echo "------------------------"
npm ci
node_modules/.bin/tsc --outDir "$CLEEPDESKTOPPATH"
echo "Done"

# copy files and dirs
echo
echo
echo "Copying release files..."
echo "------------------------"
cp -a html "$CLEEPDESKTOPPATH"
cp -a resources "$CLEEPDESKTOPPATH"
cp -a LICENSE.txt "$CLEEPDESKTOPPATH"
cp -a package.json "$CLEEPDESKTOPPATH"
cp -a README.md "$CLEEPDESKTOPPATH"
echo "Done"

# electron-builder
echo
echo
if [ "$1" == "publish" ]
then
    echo "Publishing cleepdesktop..."
    echo "--------------------------"
    GH_TOKEN=$GH_TOKEN_CLEEPDESKTOP node_modules/.bin/electron-builder --linux --x64 --projectDir "$CLEEPDESKTOPPATH" --publish always
else
    echo "Packaging cleepdesktop..."
    echo "-------------------------"
    node_modules/.bin/electron-builder --linux --x64 --projectDir "$CLEEPDESKTOPPATH"
fi

# cleaning
echo
echo
echo "Finalizing..."
echo "-------------"
sleep 1
mv "./$CLEEPDESKTOPPATH/dist" .
if [ "$1" == "publish" ]
then
    rm -rf packaging
fi
rm -rf __pycache__
rm -rf core/__pycache__
rm -rf core/libs/__pycache__
rm -rf core/modules/__pycache__
echo "Done"

echo
echo "Build result in dist/ folder"
