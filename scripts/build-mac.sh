#!/bin/bash

# Check command result
# $1: command result (usually $?)
# $2: awaited command result
# $3: error message
checkResult() {
    if [ $1 -ne $2 ]
    then
        msg=$3
        if [[ -z "$1" ]]; then
            msg="see output log"
        fi
        echo -e "${RED}Error occured: $msg.${NOCOLOR}"
        exit 1
    fi
}

# env
CLEEPDESKTOPPATH=packaging/cleepdesktop_tree

# clear previous process
rm -rf dist/
rm -rf packaging/

# create dirs
mkdir -p "$CLEEPDESKTOPPATH"

#update npm
echo
echo
echo "Building electron app..."
echo "------------------------"
npm ci
checkResult $? 0 "Failed to run npm"
node_modules/.bin/tsc --outDir "$CLEEPDESKTOPPATH"
checkResult $? 0 "Failed to build electron application"
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
    GH_TOKEN=$GH_TOKEN_CLEEPDESKTOP node_modules/.bin/electron-builder --mac --x64 --projectDir "$CLEEPDESKTOPPATH" --publish always
    checkResult $? 0 "Failed to publish cleepdesktop"
else
    echo "Packaging cleepdesktop..."
    echo "-------------------------"
    node_modules/.bin/electron-builder --mac --x64 --projectDir "$CLEEPDESKTOPPATH" --publish never
    checkResult $? 0 "Failed to package cleepdesktop"
fi

#cleaning
echo
echo
echo "Finalizing..."
echo "-------------"
sleep 1
mv "./$CLEEPDESKTOPPATH/dist" .
rm -rf packaging
echo "Done"

echo
echo "Build result in dist/ folder"
cd dist
ls -lh