#!/usr/bin/env python3
 
import os
import signal 
import sys
import json 
import socket
import requests
from threading import Thread
import time
import platform

#config
if platform.system()=='Windows':
    COMM_IP = u''
else:
    COMM_IP = u'0.0.0.0'
COMM_PORT = 9667

class CleepCommand():
    def __init__(self):
        self.command = None
        self.params = []

    def to_json(self):
        data = {
            'command': self.command,
            'params': self.params
        }
        return json.dumps(data)

class CleepCommClient():
    def __init__(self, logger):
        self.socket = None
        self.logger = logger

    def __del__(self):
        self.disconnect()

    def connect(self):
        connected = False
        for i in range(20):
            try:
                self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                self.socket.connect((COMM_IP, COMM_PORT))
                self.logger.debug(u'Connected to comm server')
                connected = True
                break
    
            except Exception as e:
                self.logger.debug('Exception occured: %s' % str(e))

            time.sleep(0.250)

        return connected

    def disconnect(self):
        self.socket.close()

    def send(self, command):
        if self.socket:
            self.socket.send(command.to_json().encode(u'utf-8'))
            return True

        return False

class CleepCommServer(Thread):
    def __init__(self, logger):
        Thread.__init__(self)
        Thread.daemon = True

        self.logger = logger
        self.socket = None
        self.conn = None
        self.addr = None
        self.running = True

    def __del__(self):
        self.running = False
        self.disconnect()

    def connect(self):
        try:
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.socket.bind((COMM_IP, COMM_PORT))

        except Exception as e:
            self.logger.exception('Exception occured:')
            return False

        return True

    def disconnect(self):
        if self.socket:
            self.socket.close()

    def run(self):
        self.logger.debug('Starting CommServer on %s:%d' % (COMM_IP, COMM_PORT))
        self.socket.listen(1)
        self.conn, self.addr = self.socket.accept()
        self.logger.debug('CommClient connected')

        while self.running:
            raw = self.conn.recv(1024)
            #raw = raw.devoce('utf-8')
            self.logger.debug('CommServer received: %s' % str(raw))
            if not raw:
                continue
            data = json.loads(raw)
            self.conn.send('ok'.encode('utf-8'))


