#!/usr/bin/env python3
 
import os
import signal 
import sys
import logging
import json 
import socket
import requests

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s %(name)s.%(funcName)s +%(lineno)s: %(levelname)-8s [%(process)d] %(message)s')

class CleepCommand():
    def __init(self):
        self.command = None
        self.params = []

    def to_json(self):
        data = {
            'command': self.command,
            'params': self.params
        }
        return json.dumps(data)

class CleepComClient():
    def __init__(self):
        self.socket = None

    def __del__(self):
        self.disconnect()

    def connect():
        try:
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.connect((u'0.0.0.0', 9667))
        except Exception as e:
            print(str(e))

    def disconnect(self):
        self.socket.close()

    def send(self, command):
        if self.socket:
            self.socket.send(command.to_json())

class CleepComServer(Thread):
    def __init__(self):
        Thread.__init__(self)
        Thread.daemon = True

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
            self.socket.bind((u'0.0.0.0', 9667))
            self.listen(1)
            self.conn, self.addr = self.socket.accept()

        except Exception as e:
            print(str(e))
            return False

        return True

    def disconnect(self):
        if self.socket:
            self.socket.close()

    def run(self):
        while self.running:
            raw = self.conn.recv(1024)
            if not raw:
                continue
            data = json.loads(raw)
            self.conn.send('ok')


