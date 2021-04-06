#!/usr/bin/env python3
 
import os
import sys
import json 
import socket
from threading import Thread
import time
import logging


class CleepCommCommand():
    """
    CleepComm command structure
    """

    def __init__(self):
        self.command = None
        self.params = {}

    def to_json(self):
        data = {
            'command': self.command,
            'params': self.params
        }
        return json.dumps(data)

class CleepCommResponse():
    def __init__(self):
        self.error = False
        self.message = ''
        self.data = None

    def to_json(self):
        data = {
            'response': True,
            'error': self.error,
            'message': self.message,
            'data': self.data
        }
        return json.dumps(data)

class CleepCommClient(Thread):
    """
    CleepComm client part
    """

    def __init__(self, ip, port, command_handler):
        Thread.__init__(self)
        Thread.daemon = True

        self.socket = None
        self.running = True
        self.ip = ip
        self.port = port
        self.command_handler = command_handler
        self.logger = logging.getLogger(self.__class__.__name__)

    def __del__(self):
        self.running = False
        self.disconnect()

    def connect(self):
        connected = False
        for i in range(20):
            try:
                self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                self.socket.connect((self.ip, self.port))
                self.logger.debug('Connected to comm server')
                connected = True
                break

            except KeyboardInterrupt:
                #user stop
                break
    
            except Exception as e:
                self.logger.debug('CleepCommClient: exception occured: %s' % str(e))

            time.sleep(0.250)

        return connected

    def disconnect(self):
        if self.socket is not None:
            self.socket.close()

    def send(self, command):
        if self.socket:
            self.socket.send(command.to_json().encode('utf-8'))
            return True

        return False

    def run(self):
        self.logger.debug('CleepCommClient is running...')
        while self.running:
            try:
                raw = self.socket.recv(1024)
                #raw = raw.decode('utf-8')
                if not raw or len(raw)==0:
                    time.sleep(0.10)
                    continue
                self.logger.debug('CleepCommClient receives: %s' % str(raw))

                if isinstance(raw, bytes):
                    raw = raw.decode('utf-8')
                command = json.loads(raw)

                #self.socket.send('ok'.encode('utf-8'))
                #self.command_handler(command['command'], command['params'])
                self.command_handler.emit(command['command'], command['params'])

            except ConnectionResetError:
                #server closed connection
                self.running = False
                self.logger.debug('Connection closed')

            except OSError:
                #server certainly closed connection
                self.running = False
                self.logger.debug('Connection closed')

            except:
                if self.socket is None:
                    self.logger.error('CleepCommClient stopped: socket is not available (do you forget to connect?)')
                    break
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
            try:
                raw = self.conn.recv(1024)
                #raw = raw.decode('utf-8')
                if not raw or len(raw)==0:
                    time.sleep(0.10)
                    continue

                self.logger.debug('CommServerClient receives: %s' % str(raw))

                if isinstance(raw, bytes):
                    raw = raw.decode('utf-8')

                command = None
                try:
                    command = json.loads(raw)
                    #self.conn.send('ok'.encode('utf-8'))
                except:
                    self.logger.debug('Invalid json')

                if not isinstance(command, dict) or 'command' not in command or 'params' not in command:
                    self.logger.debug('Invalid data received')
                else:
                    self.command_handler(command['command'], command['params'])

            except ConnectionResetError:
                #connection closed by peer
                self.logger.debug('Connection closed by peer')
                self.running = False


class CleepCommServerNodeClient(Thread):
    """
    CleepComm server client for Node socket instance
    """

    def __init__(self, conn, command_handler, logger):
        Thread.__init__(self)
        Thread.daemon = True

        self.logger = logger
        self.conn = conn
        self.command_handler = command_handler
        self.running = True
        self.delimiter = '#_#'

    def __del__(self):
        self.running = False
        self.conn.close()

    def send(self, command):
        j = command.to_json() + self.delimiter
        j = j.encode('utf-8')
        self.logger.debug('send json=%s' % j)
        self.conn.send(j)

    def stop(self):
        self.running = False
        self.conn.close()

    def run(self):
        buf = ''
        while self.running:
            try:
                raw = self.conn.recv(1024)
                if not raw or len(raw)==0:
                    time.sleep(0.10)
                    continue

                self.logger.debug('CommServerClient receives: %s' % str(raw))

                if isinstance(raw, bytes):
                    buf += raw.decode('utf-8')
                else:
                    buf += raw

                #get chunk
                command = None
                pos = buf.find('##');
                while pos>=0:
                    chunk = buf[:pos]
                    try:
                        command = json.loads(chunk)
                    except:
                        self.logger.debug('Invalid Json')
                        command
                    
                    buf = buf[pos+2:]
                    pos = buf.find('##')

                #command = None
                #try:
                #    command = json.loads(raw)

                #    for i in range(4):
                #        cmd = CleepCommCommand()
                #        cmd.command = 'ok'
                #        self.send(cmd)

                #except:
                #    self.logger.debug('Invalid json')

                resp = CleepCommResponse()
                if not isinstance(command, dict) or 'command' not in command or 'params' not in command:
                    self.logger.error('Invalid data received')
                    resp.error = True
                    resp.message = 'Invalid data received'

                else:
                    res = self.command_handler(command['command'], command['params'])
                    resp.data = res;
                self.send(resp)

            except ConnectionResetError:
                #connection closed by peer
                self.logger.debug('Connection closed by peer')
                self.running = False


class CleepCommServer(Thread):
    """
    CleepComm server part
    """

    def __init__(self, ip, port, command_handler, nodeClient=False):
        Thread.__init__(self)
        Thread.daemon = True

        self.nodeClient = nodeClient
        self.ip = ip
        self.port = port
        self.command_handler = command_handler
        self.logger = logging.getLogger(self.__class__.__name__)
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
            self.logger.exception('CleepCommServer: exception occured:')
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
                if not self.nodeClient:
                    self.client = CleepCommServerClient(conn, self.command_handler, self.logger)
                else:
                    self.client = CleepCommServerNodeClient(conn, self.command_handler, self.logger)
                self.client.start()

            else:
                #reject client connection, only one allowed
                self.logger.debug('Max client reached, reject client')
                conn.send('No more connection allowed')
                conn.close()

