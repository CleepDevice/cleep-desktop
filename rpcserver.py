#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Rpcserver based on long poll example from https://github.com/larsks/pubsub_example
Rpcserver implements:
 - authentication (login, password)
 - HTTP and HTTPS support
 - file upload and download
 - poll requests
 - command requests
 - module configs requests
 - devices list requests
"""

import os
import logging
import sys
import argparse
import json
from contextlib import contextmanager
import time
import uuid
from gevent import queue
from gevent import monkey; monkey.patch_all()
from gevent import pywsgi 
from gevent.pywsgi import LoggingLogAdapter
from utils import NoMessageAvailable, MessageResponse, MessageRequest, CommandError
import bottle
from bottle import auth_basic, response
from passlib.hash import sha256_crypt
import functools
#from .libs.raspiotconf import RaspiotConf
from comm import CleepCommand, CleepCommServer
from PyQt5.QtCore import QSettings
from flashdrive import FlashDrive

__all__ = ['app']

#constants
BASE_DIR = ''
HTML_DIR = os.path.join(BASE_DIR, 'html')
#AUTH_FILE = '/etc/raspiot/auth.conf'
#POLL_TIMEOUT = 60
#SESSION_TIMEOUT = 900 #15mins


#globals
#polling = 0
#subscribed = False
#sessions = {}
#auth_config = {}
#auth_enabled = False
logger = None
app = bottle.app()
server = None
comm = None
config = None
flashdrive = FlashDrive()

def bottle_logger(func):
    """
    Define bottle logging
    """
    def wrapper(*args, **kwargs):
        req = func(*args, **kwargs)
        logger.debug('%s %s %s %s' % (
                     bottle.request.remote_addr, 
                     bottle.request.method,
                     bottle.request.url,
                     bottle.response.status))
        return req
    return wrapper

def get_app(debug_enabled):
    """
    Return web server

    Returns:
        object: bottle instance
    """
    global logger, app

    #logging (in raspiot.conf file, module name is 'rpcserver')
    logging.basicConfig(level=logging.DEBUG, format="%(asctime)s %(name)s %(levelname)s : %(message)s")
    logger = logging.getLogger('RpcServer')
    if debug_enabled:
        logger.setLevel(logging.DEBUG)

    #load auth
    #load_auth()

    return app

def start(host='0.0.0.0', port=80, key=None, cert=None):
    """
    Start RPC server. This function is blocking.
    Start by default unsecure web server
    You can configure SSL server specifying key and cert parameters

    Args:
        host (string): host (default computer is accessible on localt network)
        port (int): port to listen to (by default is standart HTTP port 80)
        key (string): SSL key file
        cert (string): SSL certificate file
    """
    global server, app

    try:
        if key is not None and len(key)>0 and cert is not None and len(cert)>0:
            #start HTTPS server
            logger.info('Starting HTTPS server on %s:%d' % (host, port))
            server_logger = LoggingLogAdapter(logger, logging.DEBUG)
            server = pywsgi.WSGIServer((host, port), app, keyfile=key, certfile=cert, log=server_logger)
            server.serve_forever()

        else:
            #start HTTP server
            logger.info('Starting HTTP server on %s:%d' % (host, port))
            app.run(server='gevent', host=host, port=port, quiet=True, debug=False, reloader=False)

    except KeyboardInterrupt:
        #user stops raspiot, close server properly
        if not server.closed:
            server.close()

@app.hook('after_request')
def enable_cors():
    """
    You need to add some headers to each request.
    Don't use the wildcard '*' for Access-Control-Allow-Origin in production.
    """
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'PUT, GET, POST, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Origin, Accept, Content-Type, X-Requested-With, X-CSRF-Token'

@app.route('/ui', method=['OPTIONS', 'POST'])
def ui():
    logger.debug('Received command from ui')
    cmd = CleepCommand()
    cmd.command = 'coucou'
    comm.send(cmd)

@app.route('/config', method=['OPTIONS', 'POST'])
def config():
    logger.debug('Get config (method=%s)' % bottle.request.method)
    if bottle.request.method=='OPTIONS':
        return {}
    else:
        conf = {}
        if config is not None:
            conf = {
                'proxymode': config.value('proxy_mode', type=str),
                'proxyip': config.value('proxy_host', type=str),
                'proxyport': config.value('proxy_port', type=int)
            }
        return conf

@app.route('/back', method=['OPTIONS', 'POST'])
def back():
    logger.debug('Back')
    if bottle.request.method=='OPTIONS':
        return {}
    else:
        cmd = CleepCommand()
        cmd.command = 'back'
        comm.send(cmd)

@app.route('/<path:path>')
def default(path):
    """
    Servers static files from HTML_DIR.
    """
    return bottle.static_file(path, HTML_DIR)

@app.route('/')
def index():
    """
    Return a default document if no path was specified.
    """
    return bottle.static_file('index.html', HTML_DIR)

def command_received(command, params):
    logger.debug('Command %s received with params %s' % (command, params))


if __name__ == u'__main__':
    #load config
    config = QSettings('cleep', 'cleep-desktop')

    #get rpc application
    debug = True
    app = get_app(debug)

    #connect to ui
    #comm = CleepCommClient(config.value('localhost', type=str), config.value('comm_port', type=int), command_received, logger)
    comm = CleepCommServer(config.value('localhost', type=str), config.value('comm_port', type=int), command_received, logger)
    if not comm.connect():
        print('Failed to connect to ui, stop')
    comm.start()

    #start rpc server
    logger.debug('Serving files from "%s" folder.' % HTML_DIR)
    #TODO get data from config file
    start(u'0.0.0.0', config.value('rpc_port', type=int), None, None)

    #clean everythng
    comm.disconnect()


