#!/bin/sh
# params:
# $1: rpi-imager install dir
# $2: drive path
# $3: image filepath
# $4: optional wifi config file

set -eu

RPI_DIR="$1"
DRIVE="$2"
IMAGE="$3"
WIFI_FILE="${4:-}"
LOGFILE="$RPI_DIR/flash-tool.log"
IMAGER="$RPI_DIR/rpi-imager"

dt=$(date '+%d/%m/%Y %H:%M')
echo "START $dt" >> "$LOGFILE"
echo "params=$RPI_DIR $DRIVE $IMAGE $WIFI_FILE" >> "$LOGFILE"

# Linux ships the cli-only binary (rpi-imager-cli AppImage extract): no --cli flag.
# Desktop builds (macOS/Windows) still use: rpi-imager --cli <image> <drive>
"$IMAGER" "$IMAGE" "$DRIVE"
ret=$?
echo "rpi-imager returncode=$ret" >> "$LOGFILE"
if [ "$ret" != 0 ]; then
  exit "$ret"
fi

if [ -n "$WIFI_FILE" ]; then
  partition=$(/bin/lsblk --list --noheadings --output NAME "$DRIVE" | /bin/sed -n 2p)
  echo "partition=$partition" >> "$LOGFILE"

  /bin/mkdir -p /tmp/cleep_root
  /bin/mount "/dev/$partition" /tmp/cleep_root

  echo "Copy $WIFI_FILE file to /tmp/cleep_root/cleep-network.conf" >> "$LOGFILE"
  /bin/cp -f "$WIFI_FILE" /tmp/cleep_root/cleep-network.conf >> "$LOGFILE"

  /bin/sync
  /bin/umount -lf /tmp/cleep_root
  /bin/rmdir /tmp/cleep_root
fi

dt=$(date '+%d/%m/%Y %H:%M')
echo "END $dt" >> "$LOGFILE"
