#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from core import rpcserver
import sys
import os
import logging
import traceback
import time

#parameters
if len(sys.argv)!=7:
    print('Missing parameter. Usage: cleepdesktopcore <rpcport> <config path> <config filename> <mode> <isdev>')
    print(' - rpcport (int): rpc port to allow communication between ui and core')
    print(' - cache path (string): cache path')
    print(' - config path (string): configuration path')
    print(' - config filename (string): configuration filename (without path!)')
    print(' - mode (string): starting mode (release|debug)')
    print(' - isdev (bool): true if dev mode enabled')
    sys.exit(2)
try:
    rpcport = int(sys.argv[1])
except:
    print('Invalid parameter rpcport: integer expected')
    sys.exit(1)
cache_path = sys.argv[2]
config_path = sys.argv[3]
config_filename = sys.argv[4]
debug = False
if sys.argv[5]=='debug':
    debug = True
is_dev = False
if sys.argv[6]=='true':
    is_dev = True

try:
    #absolute cleepdesktopcore path
    app_path = os.path.abspath(os.path.dirname(sys.argv[0]))

    #get rpc application
    app = rpcserver.get_app(app_path, cache_path, config_path, config_filename, debug, is_dev)

    #start rpc server
    rpcserver.logger.debug('Serving files from "%s" folder.' % rpcserver.HTML_DIR)
    rpcserver.start(u'127.0.0.1', rpcport, None, None)

except Exception as e:
    #print exeption to stderr to be catched by electron
    ex_type, ex_value, ex_traceback = sys.exc_info()
    traceback.print_exception(ex_type, ex_value, ex_traceback, None, sys.stderr)

finally:
    rpcserver.stop()
    sys.exit(1)

#clean everythng
sys.exit(0)
