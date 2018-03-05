#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from core import rpcserver
import sys
import os

#parameters
if len(sys.argv)!=5:
    print('Missing parameter. Usage: cleepremote <rpcport> <config path> <config filename> <debug|release>')
    sys.exit(2)
try:
    rpcport = int(sys.argv[1])
except:
    print('Invalid parameter rpcport: integer awaited')
    sys.exit(1)
config_path = sys.argv[2]
config_filename = sys.argv[3]
mode = sys.argv[4]
debug = False
if mode=='debug':
    debug = True

#absolute cleepremote path
app_path = os.path.abspath(os.path.dirname(sys.argv[0]))

#get rpc application
app = rpcserver.get_app(app_path, config_path, config_filename, debug)

#start rpc server
rpcserver.logger.debug('Serving files from "%s" folder.' % rpcserver.HTML_DIR)
rpcserver.start(u'127.0.0.1', rpcport, None, None)

#clean everythng
sys.exit(0)

