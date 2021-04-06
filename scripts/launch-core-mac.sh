#!/bin/bash

/usr/bin/pkill -9 -f cleepdesktopcore
python3 cleepdesktopcore.py 5610 ~/Library/Application\ Support/Electron/cache_cleepdesktop ~/Library/Application\ Support/Electron/ settings.json debug true
