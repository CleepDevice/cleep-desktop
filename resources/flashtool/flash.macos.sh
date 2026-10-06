#!/bin/sh
# params:
# $1: rpi-imager install dir
# $2: drive path
# $3: image filepath
# $4: optional first-run script (passed to rpi-imager --first-run-script)

set -eu

RPI_DIR="$1"
DRIVE="$2"
IMAGE="$3"
FIRST_RUN_SCRIPT="${4:-}"
LOGFILE="$RPI_DIR/flash-tool.log"
IMAGER="$RPI_DIR/rpi-imager"

dt=$(date '+%d/%m/%Y %H:%M')
echo "START $dt" >> "$LOGFILE"
echo "params=$RPI_DIR $DRIVE $IMAGE $FIRST_RUN_SCRIPT" >> "$LOGFILE"

if [ -n "$FIRST_RUN_SCRIPT" ]; then
  "$IMAGER" --cli --first-run-script "$FIRST_RUN_SCRIPT" "$IMAGE" "$DRIVE"
else
  "$IMAGER" --cli "$IMAGE" "$DRIVE"
fi
ret=$?
echo "rpi-imager returncode=$ret" >> "$LOGFILE"

dt=$(date '+%d/%m/%Y %H:%M')
echo "END $dt" >> "$LOGFILE"
exit "$ret"
