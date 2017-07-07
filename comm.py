#!/usr/bin/env python3
 
import os
import signal 
import sys
import json 
import socket
import requests
from threading import Thread
import time


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

class CleepCommClient(Thread):
    def __init__(self, ip, port, command_handler, logger):
        Thread.__init__(self)
        Thread.daemon = True

        self.socket = None
        self.running = True
        self.ip = ip
        self.port = port
        self.command_handler = command_handler
        self.logger = logger

    def __del__(self):
        self.running = False
        self.disconnect()

    def connect(self):
        connected = False
        for i in range(20):
            try:
                self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                self.socket.connect((self.ip, self.port))
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

    def run(self):
        self.logger.debug('CommClient running...')
        while self.running:
            try:
                raw = self.socket.recv(1024)
                #raw = raw.decode('utf-8')
                if not raw or len(raw)==0:
                    time.sleep(0.10)
                    continue
                self.logger.debug('CommClient receives: %s' % str(raw))
                command = json.loads(raw)
                #self.socket.send('ok'.encode('utf-8'))
                self.command_handler(command['command'], command['params'])

            except ConnectionResetError:
                #server closed connection
                self.running = False
                self.logger.debug('Connection closed')

            except:
                self.logger.exception('Exception occured:')
                

class CleepCommServerClient(Thread):
    def __init__(self, conn, command_handler, logger):
        Thread.__init__(self)
        Thread.daemon = True

        self.logger = logger
        self.conn = conn
        self.command_handler = command_handler
        self.running = True

    def __del__(self):
        self.running = False
        self.conn.close()

    def send(self, command):
        self.conn.send(command.to_json().encode('utf-8'))

    def stop(self):
        self.running = False
        self.conn.close()

    def run(self):
        while self.running:
            raw = self.conn.recv(1024)
            #raw = raw.decode('utf-8')
            self.logger.debug('CommServerClient receives: %s' % str(raw))
            if not raw:
                continue
            command = json.loads(raw)
            #self.conn.send('ok'.encode('utf-8'))

            self.command_handler(command.command, command.params)


class CleepCommServer(Thread):
    def __init__(self, ip, port, command_handler, logger):
        Thread.__init__(self)
        Thread.daemon = True

        self.ip = ip
        self.port = port
        self.command_handler = command_handler
        self.logger = logger
        self.socket = None
        self.running = True
        self.client_count = 0
        self.client = None

    def __del__(self):
        self.running = False
        if self.client:
            self.client.stop()
        self.disconnect()

    def connect(self):
        try:
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.socket.bind((self.ip, self.port))

        except Exception as e:
            self.logger.exception('Exception occured:')
            return False

        return True

    def disconnect(self):
        if self.socket:
            self.socket.close()

    def send(self, command):
        if self.client:
            self.client.send(command)
            return True

        return False

    def run(self):
        self.logger.debug('Starting CommServer on %s:%d' % (self.ip, self.port))
        while self.running:
            self.socket.listen(5)
            conn, addr = self.socket.accept()

            if self.client_count==0:
                #accept client connection
                self.logger.debug('CommClient connected')
                self.client = CleepCommServerClient(conn, self.command_handler, self.logger)
                self.client.start()

            else:
                #reject client connection, only one allowed
                self.logger.debug('Max client reached, reject client')
                conn.send('No more connection allowed')
                conn.close()

