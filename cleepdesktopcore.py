#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from core import rpcserver
import sys
import os

#parameters
if len(sys.argv)!=6:
    print('Missing parameter. Usage: cleepdesktopcore <rpcport> <config path> <config filename> <mode> <isdev>')
    print(' - rpcport (int): rpc port to allow communication between ui and core')
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
config_path = sys.argv[2]
config_filename = sys.argv[3]
debug = False
if sys.argv[4]=='debug':
    debug = True
is_dev = False
if sys.argv[5]=='true':
    is_dev = True


#absolute cleepdesktopcore path
app_path = os.path.abspath(os.path.dirname(sys.argv[0]))

#get rpc application
app = rpcserver.get_app(app_path, config_path, config_filename, debug, is_dev)

#start rpc server
rpcserver.logger.debug('Serving files from "%s" folder.' % rpcserver.HTML_DIR)
rpcserver.start(u'127.0.0.1', rpcport, None, None)

#clean everythng
sys.exit(0)

