#!/bin/sh

#params:
# $1 : archive fullpath
# $2 : application path
# $3 : install path

/bin/rm -rf "$3/etcher-cli"
/bin/rm -rf "$3/balena-cli"
/usr/bin/tar xzf "$1" -C "$3"
/bin/rm "$1"
/bin/cp "$2/tools/flash.mac.sh" "$3/balena-cli/flash.sh"

