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
/bin/rm -rf dist/
/bin/rm -rf packaging/

# create dirs
/bin/mkdir -p "$CLEEPDESKTOPPATH"

# pyinstaller
echo
echo
echo "Packaging cleepdesktopcore..."
echo "-----------------------------"
python3 -m pip install -r requirements.txt
checkResult $? 0 "Failed to install python dependencies"
/bin/cp config/cleepdesktopcore-mac64.spec cleepdesktopcore-mac64.spec
/usr/local/bin/pyinstaller --workpath packaging --clean --noconfirm --noupx --debug all --log-level INFO cleepdesktopcore-mac64.spec
checkResult $? 0 "Failed to build core application"
/bin/rm cleepdesktopcore-mac64.spec
/bin/mv dist/cleepdesktopcore "$CLEEPDESKTOPPATH"

#update npm
echo
echo
echo "Building electron app..."
echo "------------------------"
/usr/bin/npm ci
checkResult $? 0 "Failed to run npm"
node_modules/.bin/tsc --outDir "$CLEEPDESKTOPPATH"
checkResult $? 0 "Failed to build electron application"
echo "Done"

# copy files and dirs
echo
echo
echo "Copying release files..."
echo "------------------------"
/bin/cp -a html "$CLEEPDESKTOPPATH"
/bin/cp -a resources "$CLEEPDESKTOPPATH"
/bin/cp -a LICENSE.txt "$CLEEPDESKTOPPATH"
/bin/cp -a package.json "$CLEEPDESKTOPPATH"
/bin/cp -a README.md "$CLEEPDESKTOPPATH"
echo "Done"

# electron-builder
echo
echo "DEBUG cmd param \"$1\""
if [ "$1" == "publish" ]
then
    echo "Publishing cleepdesktop..."
    echo "--------------------------"
    GH_TOKEN=$GH_TOKEN_CLEEPDESKTOP node_modules/.bin/electron-builder --mac --x64 --projectDir "$CLEEPDESKTOPPATH" --publish always
    checkResult $? 0 "Failed to publish cleepdesktop"
else
    echo "Packaging cleepdesktop..."
    echo "-------------------------"
    node_modules/.bin/electron-builder --mac --x64 --projectDir "$CLEEPDESKTOPPATH"
    checkResult $? 0 "Failed to package cleepdesktop"
fi

#cleaning
echo
echo
echo "Finalizing..."
echo "-------------"
/bin/sleep 1
/bin/mv "./$CLEEPDESKTOPPATH/dist" .
/bin/rm -rf packaging
/bin/rm -rf __pycache__
/bin/rm -rf core/__pycache__
/bin/rm -rf core/libs/__pycache__
/bin/rm -rf core/modules/__pycache__
echo "Done"

echo
echo "Build result in dist/ folder"