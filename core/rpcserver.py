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
from logging.handlers import RotatingFileHandler
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
from queue import Queue, Empty

from core.libs.appconfig import AppConfig
from core.utils import MessageResponse, AppContext
from core.modules.install import Install
from core.modules.devices import Devices
from core.modules.updates import Updates
from core.modules.config import Config
from core.modules.cache import Cache
from core.libs.crashreport import CrashReport
from core.libs.download import Download
from core.libs.cleepdesktoplogs import CleepDesktopLogs
from core.exceptions import CommandError

__all__ = ['app']

#constants
BASE_DIR = ''
HTML_DIR = os.path.join(BASE_DIR, 'html')
ETCHER_DIR = 'etcher-cli'

#globals
context = AppContext()
app = bottle.app()
modules = {}
ws_updates = Queue()

class CleepWebSocketMessage():
    def __init__(self):
        self.event = None
        self.error = False
        self.message = ''
        self.data = None

    def to_json(self):
        data = {
            'event': self.event,
            'error': self.error,
            'message': self.message,
            'data': self.data
        }
        return json.dumps(data)

def update_ui(event, data):
    """
    Update ui callback.
    Data will be processed in websocket background task

    Args:
        event (string): event name
        data (any): event data
    """
    global  ws_updates

    #push data to queue
    ws_updates.put_nowait({
        'event': event,
        'data': data,
    })

def configure_app(app_path, cache_path, config_path, config_filename, debug, is_dev):
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
        AppContext: application context (that contains crash_report, logger...)
    """
    global app, context

    #fill context
    context.paths.app = '.' if len(app_path)==0 else app_path 
    context.paths.cache = cache_path
    context.paths.config = config_path
    context.update_ui = update_ui

    #logging
    logging_formatter = logging.Formatter('%(asctime)s %(name)s.%(funcName)s +%(lineno)s: %(levelname)-8s [%(process)d] %(message)s')
    root_logger = logging.getLogger()
    context.log_filepath = os.path.join(config_path, 'cleepdesktopcore.log')
    file_handler = RotatingFileHandler(context.log_filepath, maxBytes=2*1024*1024, backupCount=2, encoding='utf-8')
    file_handler.setFormatter(logging_formatter)
    if is_dev:
        #dev mode: log to file and console with DEBUG level
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(logging_formatter)

        console_exception_handler = logging.StreamHandler()
        console_exception_handler.setFormatter(logging_formatter)

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
    context.main_logger = logging.getLogger('RpcServer')
    context.main_logger.info('===== CleepDesktopCore started =====')
    context.main_logger.info('Python version: %s' % platform.python_version())
    context.main_logger.info('Application path: %s' % app_path)
    context.main_logger.info('Configuration path: %s' % config_path)
    
    #load config
    app_config = AppConfig(os.path.join(config_path, config_filename))
    config = app_config.load_config()

    #handle debug
    debug = False
    if config['cleep']['isdev']:
        #force debug in dev mode (update config file to sync ui and core)
        config['cleep']['debug'] = True
    #update logger level
    if config['cleep']['debug']:
        debug = True
        context.main_logger.setLevel(logging.DEBUG)
    else:
        context.main_logger.setLevel(logging.WARN)
    context.main_logger.debug('Config: %s' % config)

    #init crash report (disabled by default)
    libs_version = {
        'gevent': gevent_version,
        'bottle': bottle.__version__,
        'passlib': passlib_version,
        'requests': requests_version,
        'geventwebsocket': geventwebsocket_version()
    }
    context.crash_report = CrashReport('CleepDesktop', config['cleep']['version'], libs_version, config['cleep']['isdev'])
    if config['cleep']['crashreport']:
        context.crash_report.enable()
    if config['cleep']['isdev']:
        #disable crash report during developments
        context.main_logger.debug('Crash report disabled during developments')
        context.crash_report.disable()

    #launch config module
    context.modules['config'] = Config(context, app_config, debug)
    context.config = context.modules['config']
    context.modules['config'].start()

    #launch cache module
    context.modules['cache'] = Cache(context, debug)
    context.modules['cache'].start()

    #launch install module
    context.modules['install'] = Install(context, debug)
    context.modules['install'].start()

    #launch devices module
    context.modules['devices'] = Devices(context, debug)
    context.modules['devices'].start()

    #launch updates module
    context.modules['updates'] = Updates(context, debug)
    context.modules['updates'].start()

    return context

def start(host='127.0.0.1', port=80, key=None, cert=None):
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
    global app, context

    #populate some stuff at startup
    context.modules['devices'].get_devices()
    context.modules['updates'].get_status()

    try:
        if key is not None and len(key)>0 and cert is not None and len(cert)>0:
            #start HTTPS server
            context.main_logger.info('Starting HTTPS server on %s:%d' % (host, port))
            server_logger = LoggingLogAdapter(context.main_logger, logging.INFO)
            server = pywsgi.WSGIServer((host, port), app, keyfile=key, certfile=cert, log=server_logger, handler_class=WebSocketHandler)
            server.serve_forever()

        else:
            #start HTTP server
            context.main_logger.info('Starting HTTP server on %s:%d' % (host, port))
            server_logger = LoggingLogAdapter(context.main_logger, logging.INFO)
            server = pywsgi.WSGIServer((host, port), app, log=server_logger, handler_class=WebSocketHandler)
            server.serve_forever()

    except KeyboardInterrupt:
        #user stops raspiot
        pass

    except UnicodeDecodeError:
        #maybe unsupported character in hostname
        #this is a unfixed bug in python https://bugs.python.org/issue9377
        #topic about it (no solution @ 2019/12/12)
        #https://stackoverflow.com/questions/23109244/unicodedecodeerror-with-runserver
        context.main_logger.exception('HTTP server failed to start because computer hostname seems to have unsupported characters. Please use only ASCII.')
        context.crash_report.report_exception()

    except:
        #unhandled exception
        context.main_logger.exception('HTTP server failed to start:')
        context.crash_report.report_exception()

    finally:
        #close server properly
        if server and not server.closed:
            server.close()

def stop():
    """
    Stop all running processes
    """
    global context

    for _, module in context.modules.items():
        module.stop()

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
    global context

    #context.main_logger.debug('Command (method=%s)' % bottle.request.method)
    if bottle.request.method=='OPTIONS':
        return {}
    else:
        resp = MessageResponse()
        try:
            #convert command to cleep command
            data = bottle.request.json
            # pylint: disable=E1136, E1135
            command = data['command'] if 'command' in data else None
            to = data['to'] if 'to' in data else None
            params = data['params'] if 'params' in data else None
            # pylint: enable=E1136, E1135

            #and execute command
            #context.main_logger.debug('Execute command %s with params %s' % (command, params))
            if not to in context.modules:
                raise CommandError('Module "%s" does not exist' % to)
            resp.data = context.modules[to].execute_command(command, params)

        except Exception as e:
            context.main_logger.exception('Error occured during command execution:')
            context.crash_report.report_exception()
            resp.error = True
            resp.message = str(e)

        #send response
        return json.dumps(resp.to_dict())

@app.route('/cleepws')
def handle_cleepwebsocket():
    """
    Devices websocket. Communication between python and javascript
    """
    global context, ws_updates

    #init websocket
    wsock = bottle.request.environ.get('wsgi.websocket')
    if not wsock:
        context.main_logger.error('Expected WebSocket request')
        bottle.abort(400, 'Expected WebSocket request')

    #now wait for data to send
    while True:

        try:
            event = ws_updates.get(block=True, timeout=0.25)

            #send data to socket
            send = CleepWebSocketMessage()
            send.event = event['event']
            send.data = event['data']
            wsock.send(send.to_json())

        except Empty:
            # no event on FIFO
            pass

        except WebSocketError:
            # stop statement, websocket will restart
            break

        except:
            context.main_logger.exception('Exception occured in WebSocket handler:')
            context.crash_report.report_exception()
