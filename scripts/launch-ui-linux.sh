#!/bin/sh

#ELECTRON_ENABLE_LOGGING=1 npm start --interactive --disable-http-cache

#Development Cleepdesktop launcher
# --nocore: disable cleepdesktopcore launch. You need to launch it by yourself
# --logfile: set file log level (info, warn, debug, error, silly, verbose) or disable it (no)
# --logconsole: set console log level (info, warn, debug, error, silly, verbose) or disable it (no)
./node_modules/.bin/electron . --nocore
