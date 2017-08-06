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
flashdrive = None

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
    global logger, app, flashdrive

    #logging (in raspiot.conf file, module name is 'rpcserver')
    logging.basicConfig(level=logging.DEBUG, format="%(asctime)s %(name)s %(levelname)s : %(message)s")
    logger = logging.getLogger('RpcServer')
    if debug_enabled:
        logger.setLevel(logging.DEBUG)

    #launch flash process
    flashdrive = FlashDrive()
    flashdrive.start()

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

def get_config():
    """
    Return cleep-desktop configuration

    Return:
        dict: config
    """
    conf = {}

    if config is not None:
        conf = {
            'proxymode': config.value('proxymode', type=str),
            'proxyip': config.value('proxyip', type=str),
            'proxyport': config.value('proxyport', type=int),
            'isoraspbian': config.value('isoraspbian', type=bool),
            'locale': config.value('locale', type=str)
        }
    
    return conf

def execute_command(command, params):
    """
    Execute specified command

    Args:
        command (string): command to execute
        params (dict): command parameters

    Return:
        MessageResponse
    """
    global flashdrive

    if command is None:
        logger.error('Invalid command received, unable to process it')

    resp = MessageResponse()
    try:
        #flashdrive
        if command=='getflashdrives':
            resp.data = flashdrive.get_flashable_drives()
        elif command=='getflashstatus':
            resp.data = flashdrive.get_status()
        elif command=='startflash':
            flashdrive.start_flash(params[u'uri'], params[u'drive'], config.value('isoraspbian', type=bool))
        elif command=='cancelflash':
            flashdrive.cancel_flash()
        elif command=='getisos':
            #TODO set include_raspbian param from config
            resp.data = flashdrive.get_isos(config.value('isoraspbian', type=bool))

        #default
        else:
            #unknow command
            resp.error = True
            resp.message = u'Unknown command "%s" received. Nothing processed' % command

    except Exception as e:
        logger.exception('Error occured during command execution:')
        resp.error = True
        resp.message = str(e)

    #send response
    #logger.debug('Command response: %s' % resp.to_dict())
    return json.dumps(resp.to_dict())

@app.hook('after_request')
def enable_cors():
    """
    Enable CORS on each request
    """
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'PUT, GET, POST, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Origin, Accept, Content-Type, X-Requested-With, X-CSRF-Token'

@app.route('/ui', method=['OPTIONS', 'POST'])
def ui():
    """
    Communication way between javascript and ui
    """
    logger.debug('Ui (method=%s)' % bottle.request.method)
    if bottle.request.method=='OPTIONS':
        return {}
    else:
        #convert command to cleep command
        cmd = CleepCommand()
        tmp_params = bottle.request.json
        if u'command' in tmp_params:
            cmd.command = tmp_params[u'command']
        if u'params' in tmp_params:
            cmd.params = tmp_params[u'params']

        #and send command to ui
        return comm.send(cmd)

@app.route('/command', method=['OPTIONS', 'POST'])
def command():
    """
    Communication way between javascript and rpcserver
    """
    #logger.debug('Command (method=%s)' % bottle.request.method)
    if bottle.request.method=='OPTIONS':
        return {}
    else:
        #convert command to cleep command
        data = bottle.request.json
        command = None
        if u'command' in data:
            command = data[u'command']
        params = None
        if u'params' in data:
            params = data[u'params']

        #and execute command
        #logger.debug('Execute command %s with params %s' % (command, params))
        return execute_command(command, params)

@app.route('/config', method=['OPTIONS', 'POST', 'PUT'])
def config():
    """
    Return current configuration
    """
    logger.debug('Config (method=%s)' % bottle.request.method)
    resp = MessageResponse()

    if bottle.request.method=='OPTIONS':
        return {}

    if bottle.request.method=='PUT':
        data = bottle.request.json
        logger.debug('Data=%s' % data)
        if config is not None and 'params' in data and 'config' in data['params']:
            data_config = data['params']['config']
            try:
                if 'proxymode' in data_config:
                    config.setValue('proxymode', data_config['proxymode'])
                if 'proxyport' in data_config:
                    config.setValue('proxyport', data_config['proxyport'])
                if 'proxyip' in data_config:
                    config.setValue('proxyip', data_config['proxyip'])
                if 'isoraspbian' in data_config:
                    config.setValue('isoraspbian', data_config['isoraspbian'])
                if 'locale' in data_config:
                    config.setValue('locale', data_config['locale'])
                config.sync()

                #once updated, return cleep-desktop config
                resp.data = {
                    'config': get_config()
                }

            except:
                logger.exception('Unable to save configuration:')
                resp.error = True
                resp.message('Unable to save configuration')

    else:
        #return cleep-desktop config
        resp.data = {
            'config': get_config()
        }

    return json.dumps(resp.to_dict())

@app.route('/back', method=['OPTIONS', 'POST'])
def back():
    """
    Go back in right panel
    """
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
    Serves static files from HTML_DIR.
    """
    return bottle.static_file(path, HTML_DIR)

@app.route('/')
def index():
    """
    Return a default document
    """
    return bottle.static_file('index.html', HTML_DIR)

def command_received(command, params):
    """
    Process command received from Ui
    """
    logger.debug('Command %s received with params %s' % (command, params))


if __name__ == u'__main__':
    #load config
    config = QSettings('cleep', 'cleep-desktop')

    #get rpc application
    debug = True
    app = get_app(debug)

    #connect to ui
    #comm = CleepCommClient(config.value('localhost', type=str), config.value('commport', type=int), command_received, logger)
    comm = CleepCommServer(config.value('localhost', type=str), config.value('commport', type=int), command_received, logger)
    if not comm.connect():
        print('Failed to connect to ui, stop')
    comm.start()

    #start rpc server
    logger.debug('Serving files from "%s" folder.' % HTML_DIR)
    start(u'0.0.0.0', config.value('rpcport', type=int), None, None)

    #clean everythng
    comm.disconnect()


