#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Rpcserver based on long poll example from https://github.com/larsks/pubsub_example
Rpcserver implements:
 - authentication (login, password)
 - HTTP and HTTPS support
 - file upload and download
 - websocket requests
 - command requests
 - module configs requests
 - devices list requests
"""

import os
import platform
import logging
import sys
import argparse
import json
import copy
from contextlib import contextmanager
from threading import Lock
import time
import uuid
from gevent import __version__ as gevent_version
from gevent import queue
from gevent import monkey; monkey.patch_all()
from gevent import pywsgi 
from gevent.pywsgi import LoggingLogAdapter
from geventwebsocket import get_version as geventwebsocket_version
from geventwebsocket import WebSocketError
from geventwebsocket.handler import WebSocketHandler
import bottle
from bottle import auth_basic, response
from passlib import __version__ as passlib_version
from passlib.hash import sha256_crypt
from requests import __version__ as requests_version

from core.utils import MessageResponse
from core.flashdrive import FlashDrive
from core.devices import Devices
from core.updates import Updates
from core.libs.crashreport import CrashReport
from core.libs.download import Download
from core.libs.cleepdesktoplogs import CleepDesktopLogs

__all__ = ['app']

#constants
BASE_DIR = ''
HTML_DIR = os.path.join(BASE_DIR, 'html')
ETCHER_DIR = 'etcher-cli'

#globals
logger = None
app = bottle.app()
server = None
config = None
config_file = None
log_file = None
config_lock = Lock()
updates = None
flashdrive = None
devices = None
crash_report = None
cached_isos_path = None

#websocket variables
current_devices = None
last_devices_update = 0
current_updates = None
last_updates_update = 0
current_flash = None
last_flash_update = 0
current_message = None
last_message_update = 0


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
    global config_file
    force_reload = False
    out = False

    #check if module have config file
    if config_file is None:
        logger.error(u'Config filepath not set. Unable to save configuration')
        return False

    config_lock.acquire(True)
    try:
        f = open(config_file, u'w')
        f.write(json.dumps(config))
        f.close()
        force_reload = True
        out = True
    except:
        logger.exception(u'Unable to write config file %s:' % config_file)
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
    global config_file, config

    #check if module have config file
    if config_file is None:
        logger.error(u'Config filepath not set. Unable to load configuration')
        return None

    config_lock.acquire(True)
    out = None
    try:
        logger.debug(u'Loading conf file %s' % config_file)
        if os.path.exists(config_file):
            f = open(config_file, u'r')
            raw = f.read()
            f.close()
            config = json.loads(raw)
            out = config
        else:
            #no conf file yet
            logger.warning('No config file found at "%s"' % config_file)
    except:
        logger.exception(u'Unable to load config file %s:' % config_file)
    config_lock.release()

    return out

def devices_update(devices):
    """
    This function is triggered by Devices module when devices list is updated
    """
    global current_devices, last_devices_update

    current_devices = devices
    last_devices_update = time.time()

def message_update(message):
    """
    This function is triggered by Devices module when message on bus is received
    """
    global current_message, last_message_update

    current_message = message
    last_message_update = time.time()

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
    #TODO move this part of code to updates.js after having put config in global and set it in angular (see appUpdater)
    if updates['etcherstatus']['version']!=config['etcher']['version']:
        logger.debug('New etcher version installed. Update config')
        config['etcher']['version'] = updates['etcherstatus']['version']
        save_config(config)

    current_updates = updates
    last_updates_update = time.time()

def get_app(app_path, cache_path, config_path, config_filename, debug, is_dev):
    """
    Return web server instance

    Args:
        app_path (string): absolute application path
        cache_path (string): cache path
        config_path (string): configuration path
        config_filename (string): configuration filename
        debug (bool): True if debug enabled
        is_dev (bool): True if launch in dev mode
    Returns:
        object: bottle instance
    """
    global logger, app, config, config_file, log_file, flashdrive, devices, updates, crash_report, cached_isos_path

    #set globals
    cached_isos_path = cache_path

    #logging
    logging_formatter = logging.Formatter('%(asctime)s %(name)s.%(funcName)s +%(lineno)s: %(levelname)-8s [%(process)d] %(message)s')
    root_logger = logging.getLogger()
    log_file = os.path.join(config_path, 'cleepdesktopcore.log')
    file_handler = logging.FileHandler(log_file)
    file_handler.setFormatter(logging_formatter)
    if is_dev:
        #dev mode: log to file and console with DEBUG level
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(logging_formatter)
        console_handler.addFilter(lambda record: record.levelno<=logging.WARNING)

        console_exception_handler = logging.StreamHandler()
        console_exception_handler.setFormatter(logging_formatter)
        console_exception_handler.addFilter(lambda record: record.levelno>logging.WARNING)

        root_logger.addHandler(file_handler)
        root_logger.addHandler(console_handler)
        root_logger.setLevel(logging.DEBUG)
    elif debug:
        #debug mode: log to file with DEBUG level
        root_logger.addHandler(file_handler)
        root_logger.setLevel(logging.DEBUG)
    else:
        #other mode: log to file with INFO level
        root_logger.addHandler(file_handler)
        root_logger.setLevel(logging.INFO)

    #set rpclogger
    logger = logging.getLogger('RpcServer')
    logger.info('===== CleepDesktopCore started =====')
    logger.info('Python version: %s' % platform.python_version())
    logger.info('Application path: %s' % app_path)
    logger.info('Configuration path: %s' % config_path)
    
    #load config
    config_file = os.path.join(config_path, config_filename)
    load_config()
    logger.debug('Config: %s' % config)

    #handle debug
    debug = False
    if config['cleep']['isdev']:
        #force debug in dev mode (update config file to sync ui and core)
        config['cleep']['debug'] = True
    #update logger level
    if config['cleep']['debug']:
        debug = True
        logger.setLevel(logging.DEBUG)
    else:
        logger.setLevel(logging.WARN)
    logger.debug('Config: %s' % config)

    #init crash report (disabled by default)
    libs_version = {
        'gevent': gevent_version,
        'bottle': bottle.__version__,
        'passlib': passlib_version,
        'requests': requests_version,
        'geventwebsocket': geventwebsocket_version()
    }
    crash_report = CrashReport('CleepDesktop', config['cleep']['version'], libs_version, config['cleep']['isdev'])
    if config['cleep']['crashreport']:
        crash_report.enable()
    if config['cleep']['isdev']:
        #disable crash report during developments
        logger.debug('Crash report disabled during developments')
        crash_report.disable()

    #launch flash process
    flashdrive = FlashDrive(app_path, cached_isos_path, config_path, flash_update, debug, crash_report)
    flashdrive.start()

    #launch devices process
    devices = Devices(devices_update, message_update, debug, crash_report)
    devices.start()

    #launch updates process
    etcher_version = config['etcher']['version']
    updates = Updates(app_path, config_path, config['cleep']['version'], etcher_version, updates_update, debug, crash_report)
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
            server_logger = LoggingLogAdapter(logger, logging.INFO)
            server = pywsgi.WSGIServer((host, port), app, log=server_logger, handler_class=WebSocketHandler)
            server.serve_forever()

    except KeyboardInterrupt:
        #user stops raspiot, close server properly
        if not server.closed:
            server.close()

def stop():
    """
    Stop all running processes
    """
    if flashdrive:
        flashdrive.stop()
    if devices:
        devices.stop()
    if updates:
        updates.stop()

def process_config(old, new):
    """
    Process configuration after save
    """
    global crash_report, updates, devices, flashdrive

    #process debug flag
    if old['cleep']['debug']!=new['cleep']['debug']:
        if new['cleep']['debug']:
            logger.setLevel(logging.DEBUG)
            updates.set_debug(True)
            devices.set_debug(True)
            flashdrive.set_debug(True)
        else:
            logger.setLevel(logging.WARN)
            updates.set_debug(False)
            devices.set_debug(False)
            flashdrive.set_debug(False)
            
    #process crashreport flag
    if old['cleep']['crashreport']!=new['cleep']['crashreport']:
        if new['cleep']['crashreport']:
            crash_report.enable()
        else:
            crash_report.disable()

def get_config():
    """
    Return CleepDesktop configuration

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
    global flashdrive, log_file, cached_isos_path

    if command is None:
        logger.error('Invalid command received, unable to process it')

    resp = MessageResponse()
    try:
        #preferences
        if command=='getconfig':
            resp.data = {
                'config': get_config(),
                'logs': log_file
            }
        elif command=='setconfig':
            old_config = copy.deepcopy(get_config())
            if not save_config(params['config']):
                resp.messages = 'Unable to save config'
                resp.error = True
            else:
                process_config(old_config, get_config())
                resp.data = True
        elif command=='getcachedfiles':
            dl = Download(cached_isos_path)
            resp.data = dl.get_cached_files()
        elif command=='deletecachedfile':
            dl = Download(cached_isos_path)
            dl.delete_cached_file(params['filename'])
            resp.data = dl.get_cached_files()
        elif command=='purgecachedfiles':
            dl = Download(cached_isos_path)
            dl.purge_files(force_all=True)
            resp.data = dl.get_cached_files()
        elif command=='getzippedlogs':
            zip = CleepDesktopLogs()
            resp.data = zip.get_zipped_logs()
      
        #flashdrive
        elif command=='getflashdrives':
            resp.data = flashdrive.get_flashable_drives()
        elif command=='getflashstatus':
            resp.data = flashdrive.get_status()
        elif command=='startflash':
            flashdrive.start_flash(params['url'], params['drive'], params['wifi'], config['cleep']['isoraspbian'], config['cleep']['isolocal'])
        elif command=='cancelflash':
            flashdrive.cancel_flash()
        elif command=='getisos':
            resp.data = flashdrive.get_isos(config['cleep']['isoraspbian'], config['cleep']['isolocal'])
        elif command=='getwifinetworks':
            resp.data = flashdrive.get_wifi_networks()
        elif command=='getwifiadapter':
            resp.data = flashdrive.get_wifi_adapter()

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
        crash_report.report_exception()
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
    Communication between javascript and python
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
    Devices websocket. Communication between python and javascript
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
    local_last_message_update = 0
    while True:

        try:
            if last_devices_update>=local_last_devices_update:
                #send devices list
                #logger.debug('Send device update: %s' % current_devices)
                send = CleepWebSocketMessage()
                send.module = 'devices'
                send.data = current_devices
                wsock.send(send.to_json())
            
                #update local update
                local_last_devices_update = time.time()

            if last_updates_update>=local_last_updates_update:
                #send new devices list
                #logger.debug('Send updates update: %s' % current_updates)
                send = CleepWebSocketMessage()
                send.module = 'updates'
                send.data = current_updates
                wsock.send(send.to_json())
            
                #update local update
                local_last_updates_update = time.time()

            if last_flash_update>=local_last_flash_update:
                #send new flash list
                #logger.debug('Send flash update: %s' % current_flash)
                send = CleepWebSocketMessage()
                send.module = 'flash'
                send.data = current_flash
                wsock.send(send.to_json())
            
                #update local update
                local_last_flash_update = time.time()

            if last_message_update>=local_last_message_update:
                #send new message
                #logger.debug('Send message update: %s' % current_message)
                send = CleepWebSocketMessage()
                send.module = 'message'
                send.data = current_message
                wsock.send(send.to_json())
            
                #update local update
                local_last_message_update = time.time()

        except WebSocketError:
            #logger.exception('WebSocket error:')
            break

        except:
            logger.exception('Exception occured in WebSocket handler:')
            break

        time.sleep(.25)


