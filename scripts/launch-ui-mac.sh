#!/bin/sh

#ELECTRON_ENABLE_LOGGING=1 npm start --interactive --disable-http-cache

#Development Cleepdesktop launcher
# --nocore: disable cleepdesktopcore launch. You need to launch it by yourself
# --logfile: set file log level (info, warn, debug, error, silly, verbose) or disable it (no)
# --logconsole: set console log level (info, warn, debug, error, silly, verbose) or disable it (no)
#LANG refer to workaround of issue https://github.com/electron/electron/issues/8876
LANG=en_US.UTF-8 ./node_modules/.bin/electron . --nocore
