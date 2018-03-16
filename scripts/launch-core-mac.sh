#!/bin/bash

/usr/bin/pkill -9 -f cleepdesktopcore
python3 cleepdesktopcore.py 5610 ~/Library/Application\ Support/CleepDesktop/ Settings debug true
