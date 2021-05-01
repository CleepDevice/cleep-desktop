#!/usr/bin/env bash

# Workaround for appimage rights error under linux

set -eu

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
exec "$SCRIPT_DIR/cleepdesktop-bin" --no-sandbox "$@"
