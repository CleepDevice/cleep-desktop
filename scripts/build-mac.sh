#!/bin/bash
set -euo pipefail

# Check command result
# $1: command result (usually $?)
# $2: awaited command result
# $3: error message
checkResult() {
    if [ "$1" -ne "$2" ]
    then
        msg=$3
        if [[ -z "${3:-}" ]]; then
            msg="see output log"
        fi
        echo -e "Error occured: $msg."
        exit 1
    fi
}

resolve_gh_token() {
    if [[ -n "${GH_TOKEN:-}" ]]; then
        return
    fi
    if [[ -n "${GITHUB_TOKEN:-}" ]]; then
        export GH_TOKEN="$GITHUB_TOKEN"
        return
    fi
    if [[ -n "${GH_TOKEN_CLEEPDESKTOP:-}" ]]; then
        export GH_TOKEN="$GH_TOKEN_CLEEPDESKTOP"
    fi
}

# env
CLEEPDESKTOPPATH=packaging/cleepdesktop_tree

# clear previous process
rm -rf dist/
rm -rf packaging/

# create dirs
mkdir -p "$CLEEPDESKTOPPATH"

# electron app (tsc + preload + assets)
echo
echo
echo "Building electron app..."
echo "------------------------"
npm ci
checkResult $? 0 "Failed to run npm"
npm run build
checkResult $? 0 "Failed to build electron application"
echo "Done"

# assemble packaging tree for electron-builder
echo
echo
echo "Copying release files..."
echo "------------------------"
cp -a build/. "$CLEEPDESKTOPPATH/"
cp -a resources "$CLEEPDESKTOPPATH/"
cp -a LICENSE.txt "$CLEEPDESKTOPPATH/"
cp -a README.md "$CLEEPDESKTOPPATH/"
echo "Done"

# electron-builder
echo
echo
if [ "${1:-}" == "publish" ]
then
    echo "Publishing cleepdesktop..."
    echo "--------------------------"
    resolve_gh_token
    if [[ -z "${GH_TOKEN:-}" ]]; then
        echo "Error occured: GH_TOKEN / GITHUB_TOKEN is required to publish."
        exit 1
    fi
    node_modules/.bin/electron-builder --mac --arm64 --projectDir "$CLEEPDESKTOPPATH" --publish always
    checkResult $? 0 "Failed to publish cleepdesktop"
else
    echo "Packaging cleepdesktop..."
    echo "-------------------------"
    node_modules/.bin/electron-builder --mac --arm64 --projectDir "$CLEEPDESKTOPPATH" --publish never
    checkResult $? 0 "Failed to package cleepdesktop"
fi

# cleaning
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
