#!/usr/bin/env python
# -*- coding: utf-8 -*-

from core import rpcserver
from core.libs.tools import install_trace_logging_level
import sys
import os
import traceback
import time

# parameters
if len(sys.argv)!=7:
    print('Missing parameter. Usage: cleepdesktopcore <rpcport> <cache path> <config path> <config filename> <mode> <isdev>')
    print(' - rpcport (int): rpc port to allow communication between ui and core')
    print(' - cache path (string): cache path')
    print(' - config path (string): configuration path')
    print(' - config filename (string): configuration filename (without path!)')
    print(' - mode (string): starting mode (release|debug)')
    print(' - isdev (string): true if dev mode enabled (true|false)')
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
app_context = None

try:
    install_trace_logging_level()

    # absolute cleepdesktopcore path
    app_path = os.path.abspath(os.path.dirname(sys.argv[0]))

    # get rpc application
    app_context = rpcserver.configure_app(app_path, cache_path, config_path, config_filename, debug, is_dev)

    # start rpc server
    app_context.main_logger.debug('Serving files from "%s" folder.' % rpcserver.HTML_DIR)
    rpcserver.start('127.0.0.1', rpcport, None, None)

except Exception as e:
    # print exception to stderr to be catched by electron
    ex_type, ex_value, ex_traceback = sys.exc_info()
    traceback.print_exception(ex_type, ex_value, ex_traceback, None, sys.stderr)

    # crash report if possible
    if app_context and app_context.crash_report:
        app_context.crash_report.report_exception()

finally:
    rpcserver.stop()
    sys.exit(1)

# clean everythng
sys.exit(0)
