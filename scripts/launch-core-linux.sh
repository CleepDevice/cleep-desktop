#!/bin/bash

/usr/bin/pkill -9 -f cleepdesktopcore
python3 cleepdesktopcore.py 5610 ~/config/Electron/cache_cleepdesktop ~/.config/Electron settings.json debug true
