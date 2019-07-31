#!/bin/sh

# Script to download latest versions of angularjs framework and angularjs-material
# It will save all needed files in execution directory and remove useless files

export ANGULARJS=angular
export ANGULARJS_DIST=https://code.angularjs.org
export ANGULARMAT=angular-material
export UIROUTER=angular-ui-router
export TMP_DIR=/tmp/cleep-libs

# Check command result
# $1: command result (usually $?)
# $2: awaited command result
# $3: error message
checkResult() {
    if [ $1 -ne $2 ]; then
        msg=$3
        if [[ -z "$1" ]]; then
            msg="see output log"
        fi
        echo -e "${RED}Error occured: $msg.${NOCOLOR}"
        rm -rf $TMP_DIR
        exit 1
    fi
}

#init
export DEST=`pwd`
mkdir -p $TMP_DIR
cd $TMP_DIR

#angularjs
mkdir angularjs
cd angularjs
npm pack $ANGULARJS
export VERSION=`ls -1 | awk -F "-" '{ gsub("\.tgz","",$2); print $2 }'`
echo "Found angularjs version: $VERSION"
checkResult $? 0 "Unable to download angularjs"
tar xzvf *.tgz
checkResult $? 0 "Unable to extract angularjs archive"
cp -a package/angular.min.js $DEST/.
checkResult $? 0 "Unable to copy angularjs files"
wget -P "$DEST/" "$ANGULARJS_DIST/$VERSION/angular-animate.min.js"
checkResult $? 0 "Unable to download dist files"
wget -P "$DEST/" "$ANGULARJS_DIST/$VERSION/angular-aria.min.js"
checkResult $? 0 "Unable to download dist files"
wget -P "$DEST/" "$ANGULARJS_DIST/$VERSION/angular-messages.min.js"
checkResult $? 0 "Unable to download dist files"
wget -P "$DEST/" "$ANGULARJS_DIST/$VERSION/angular-sanitize.min.js"
checkResult $? 0 "Unable to download dist files"
cd ..
rm -rf angularjs

#angular-material
mkdir angularmat
cd angularmat
npm pack $ANGULARMAT
checkResult $? 0 "Unable to download angular-material"
tar xzvf *.tgz
checkResult $? 0 "Unable to extract angular-material archive"
cp -a package/angular-material.min.css $DEST/.
checkResult $? 0 "Unable to copy angular-material files"
cp -a package/angular-material.min.js $DEST/.
checkResult $? 0 "Unable to copy angular-material files"
cd ..
rm -rf angularmat

#angular-ui-router
mkdir angularuirouter
cd angularuirouter
npm pack $UIROUTER
checkResult $? 0 "Unable to download angular-ui-router"
tar xzvf *.tgz
checkResult $? 0 "Unable to extract angular-ui-router archive"
cp -a package/release/angular-ui-router.min.js $DEST/.
checkResult $? 0 "Unable to copy angular-ui-router files"

#cleanup
rm -rf $TMP_DIR
