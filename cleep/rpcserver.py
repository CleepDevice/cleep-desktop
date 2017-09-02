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
from threading import Lock
import time
import uuid
from gevent import queue
from gevent import monkey; monkey.patch_all()
from gevent import pywsgi 
from gevent.pywsgi import LoggingLogAdapter
from geventwebsocket import WebSocketError
from geventwebsocket.handler import WebSocketHandler
import bottle
from bottle import auth_basic, response
from passlib.hash import sha256_crypt

from cleep.utils import NoMessageAvailable, MessageResponse, MessageRequest, CommandError
from cleep.flashdrive import FlashDrive
from cleep.devices import Devices
from cleep.updates import Updates

__all__ = ['app']

#constants
BASE_DIR = ''
HTML_DIR = os.path.join(BASE_DIR, 'html')

#globals
logger = None
app = bottle.app()
server = None
config = None
config_path = None
config_lock = Lock()
flashdrive = None
devices = None

current_devices = None
last_devices_update = 0

current_updates = None
last_updates_update = 0

current_flash = None
last_flash_update = 0


class CleepWebSocketMessage():
    def __init__(self):
        self.module = None
        self.error = False
        self.message = ''
        self.data = None

    def to_json(self):
        data = {
            'module': self.module,
            'error': self.error,
            'message': self.message,
            'data': self.data
        }
        return json.dumps(data)


def save_config(config):
    """
    Save config file.

    Args:
        config (dict): config to save.
    
    Returns:
        bool: True if file successfully saved, False otherwise
    """
    global config_path
    force_reload = False
    out = False

    #check if module have config file
    if config_path is None:
        logger.error(u'Config filepath not set. Unable to save configuration')
        return False

    config_lock.acquire(True)
    try:
        f = open(config_path, u'w')
        f.write(json.dumps(config))
        f.close()
        force_reload = True
        out = True
    except:
        logger.exception(u'Unable to write config file %s:' % config_path)
    config_lock.release()

    if force_reload:
        #reload config
        load_config()

    return out

def load_config():
    """
    Load config file.

    Returns:
        dict: configuration file content or None if error occured.
    """
    global config_path, config

    #check if module have config file
    if config_path is None:
        logger.error(u'Config filepath not set. Unable to load configuration')
        return None

    config_lock.acquire(True)
    out = None
    try:
        logger.debug(u'Loading conf file %s' % config_path)
        if os.path.exists(config_path):
            f = open(config_path, u'r')
            raw = f.read()
            f.close()
            config = json.loads(raw)
            out = config
        else:
            #no conf file yet
            logger.warning('No config file found at "%s"' % config_path)
    except:
        logger.exception(u'Unable to load config file %s:' % config_path)
    config_lock.release()

    return out

def devices_update(devices):
    """
    This function is triggered by Devices module when devices list is updated
    """
    global current_devices, last_devices_update

    current_devices = devices
    last_devices_update = time.time()

def flash_update(status):
    """
    This function is triggered by Flashdrive module when flash process is running
    """
    global current_flash, last_flash_update

    current_flash = status
    last_flash_update = time.time()

def updates_update(updates):
    """
    This function is triggered by Updates module when updates status is updated
    """
    global current_updates, last_updates_update, config

    #check software versions and store new versions on config file
    if updates['etcherversion']!=config['etcher']['version']:
        logger.debug('New etcher version installed. Update config')
        config['etcher']['version'] = updates['etcherversion']
        save_config(config)

    elif updates['cleepversion']!=config['cleep']['version']:
        logger.debug('New cleep version installed. Update config')
        config['cleep']['version'] = updates['cleepversion']
        save_config(config)

    current_updates = updates
    last_updates_update = time.time()

def get_app(config_path_, debug_enabled):
    """
    Return web server instance

    Args:
        config_path_ (string): configuration file path
        debug_enabled (bool): True if debug enabled

    Returns:
        object: bottle instance
    """
    global logger, app, config, config_path, flashdrive, devices, updates

    #logging
    logging.basicConfig(level=logging.WARNING, format='%(asctime)s %(name)s.%(funcName)s +%(lineno)s: %(levelname)-8s [%(process)d] %(message)s')
    logger = logging.getLogger('RpcServer')
    if debug_enabled:
        logger.setLevel(logging.DEBUG)

    #load config
    config_path = config_path_
    load_config()
    logger.debug('Config: %s' % config)

    #launch flash process
    flashdrive = FlashDrive(flash_update)
    flashdrive.start()

    #launch devices process
    devices = Devices(devices_update)
    devices.start()

    #launch updates process
    updates = Updates(config['cleep']['version'], config['etcher']['version'], updates_update)
    updates.start()

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
    global server, app, devices, current_devices

    #populate current devices
    current_devices = devices.get_devices()
    
    #get current update status
    current_updates = updates.get_status()

    try:
        if key is not None and len(key)>0 and cert is not None and len(cert)>0:
            #start HTTPS server
            logger.info('Starting HTTPS server on %s:%d' % (host, port))
            server_logger = LoggingLogAdapter(logger, logging.INFO)
            server = pywsgi.WSGIServer((host, port), app, keyfile=key, certfile=cert, log=server_logger, handler_class=WebSocketHandler)
            server.serve_forever()

        else:
            #start HTTP server
            logger.info('Starting HTTP server on %s:%d' % (host, port))
            app.run(server='gevent', host=host, port=port, quiet=True, debug=False, reloader=False, handler_class=WebSocketHandler)

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
    global config
    return config

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
        #preferences
        if command=='getconfig':
            resp.data = {
                'config': get_config()
            }
        elif command=='setconfig':
            if not save_config(params['config']):
                resp.messages = 'Unable to save config'
                resp.error = True
            else:
                resp.data = True

        #devices
        elif command=='openDevicePage':
            resp.data = open_device_page(params)
        
        #flashdrive
        elif command=='getflashdrives':
            resp.data = flashdrive.get_flashable_drives()
        elif command=='getflashstatus':
            resp.data = flashdrive.get_status()
        elif command=='startflash':
            flashdrive.start_flash(params[u'url'], params[u'drive'], config['cleep']['isoraspbian'])
        elif command=='cancelflash':
            flashdrive.cancel_flash()
        elif command=='getisos':
            #TODO set include_raspbian param from config
            resp.data = flashdrive.get_isos(config['cleep']['isoraspbian'])

        #updates
        elif command=='getupdatesstatus':
            resp.data = updates.get_status()
        elif command=='checkupdates':
            resp.data = updates.check_updates()

        #about
        elif command=='version':
            resp.data = {
                'version': config['cleep']['version']
            }

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

@app.route('/cleepws')
def handle_cleepwebsocket():
    """
    Devices websocket. Used to update ui when devices list is updated
    """
    global current_devices, last_devices_update, current_updates, last_updates_update

    #init websocket
    wsock = bottle.request.environ.get('wsgi.websocket')
    if not wsock:
        logger.error('Expected WebSocket request')
        bottle.abort(400, 'Expected WebSocket request')

    #now wait for module updates (devices, updates...)
    local_last_devices_update = 0
    local_last_updates_update = 0
    local_last_flash_update = 0
    while True:

        try:
            if last_devices_update>=local_last_devices_update:
                #devices update
                logger.debug('Send device update')
                #send new devices list
                send = CleepWebSocketMessage()
                send.module = 'devices'
                send.data = current_devices
                wsock.send(send.to_json())
            
                #update local update
                local_last_devices_update = time.time()

            if last_updates_update>=local_last_updates_update:
                #updates update
                logger.debug('Send updates update')
                #send new devices list
                send = CleepWebSocketMessage()
                send.module = 'updates'
                send.data = current_updates
                wsock.send(send.to_json())
            
                #update local update
                local_last_updates_update = time.time()

            if last_flash_update>=local_last_flash_update:
                #flash update
                logger.debug('Send flash update')
                #send new flash list
                send = CleepWebSocketMessage()
                send.module = 'flash'
                send.data = current_flash
                wsock.send(send.to_json())
            
                #update local update
                local_last_flash_update = time.time()

        except WebSocketError:
            #logger.exception('WebSocket error:')
            break

        except:
            logger.exception('Exception occured in WebSocket handler:')
            break

        time.sleep(.25)

