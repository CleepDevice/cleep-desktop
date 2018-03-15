#!/bin/sh

#params:
# $1 : archive fullpath
# $2 : application path
# $3 : install path

/bin/rm -rf $3/etcher-cli
/bin/tar xzvf $1 -C $3
/bin/mv $3/Etcher-cli* $3/etcher-cli
/bin/cp $2/tools/flash.linux.sh $3/flash.sh

