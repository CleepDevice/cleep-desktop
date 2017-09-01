#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from cleep import rpcserver
import sys

#parameters
if len(sys.argv)!=3:
    print('Missing parameter. Usage: cleepremote <rpcport> <configpath>')
    sys.exit(2)
try:
    rpcport = int(sys.argv[1])
except:
    print('Invalid parameter rpcport: integer awaited')
    sys.exit(1)
config_path = sys.argv[2]

#get rpc application
debug = True
app = rpcserver.get_app(config_path, debug)

#start rpc server
rpcserver.logger.debug('Serving files from "%s" folder.' % rpcserver.HTML_DIR)
rpcserver.start(u'127.0.0.1', rpcport, None, None)

#clean everythng
sys.exit(0)

