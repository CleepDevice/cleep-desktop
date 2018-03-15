#!/bin/sh

#script params:
# $1: install path
# $2: drive path
# $3: image filepath
# $4: wifi config file

LOGFILE="$1/etcher-cli.log"

dt=$(date '+%d/%m/%Y %H:%M')
echo "START $dt" >> $LOGFILE
echo "params=$1 $2 $3 $4" >> $LOGFILE

#flash drive
"$1/etcher-cli/etcher" --yes --unmount --drive $2 $3
ret=$?
echo "etcher-cli returncode=$ret" >> $LOGFILE
if [ $ret != 0 ]
then
    exit $ret
fi

#copy default wifi config
if [ ! -z "$4" ]
then
    #search root partition
    partition=`/bin/lsblk --list --noheadings --output NAME $2 | /bin/sed -n 2p`
    echo "partition=$partition" >> $LOGFILE

    #mount first drive partition (should be root one in fat32)
    /bin/mkdir /tmp/raspiot_root
    /bin/mount /dev/$partition /tmp/raspiot_root

    #then copy file
    echo "Copy $4 file to /tmp/raspiot_root/cleepwifi.conf" >> $LOGFILE
    /bin/cp -f "$4" /tmp/raspiot_root/cleepwifi.conf >> $LOGFILE

    #and umount/clean properly
    /bin/sync
    /bin/umount -lf /tmp/raspiot_root
    /bin/rmdir /tmp/raspiot_root
fi

dt=$(date '+%d/%m/%Y %H:%M')
echo "END $dt" >> $LOGFILE
