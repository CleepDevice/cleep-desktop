#!/usr/bin/env python
# -*- coding: utf-8 -*-

__all__ = ['CommandError', 'CommandInfo', 'NoResponse', 'NoMessageAvailable', 'InvalidParameter', 'MissingParameter', 
           'InvalidMessage', 'Unauthorized', 'BusError', 'MessageResponse', 'MessageRequest']

from threading import Thread
import logging
import time

class CleepremoteModule(Thread):
    def __init__(self, debug_enabled, crash_report):
        """
        Constructor

        Args:
            debug_enabled (bool): flag to set debug level to logge
            crash_report (CrashReport): crash report instance
        """
        Thread.__init__(self)
        Thread.daemon = True

        #init logger
        self.logger = logging.getLogger(self.__class__.__name__)
        if debug_enabled:
            self.logger.setLevel(logging.DEBUG)
        self.debug_enabled = debug_enabled

        #members
        self.crash_report = crash_report
        self.running = True

    def __del__(self):
        """
        Destructor
        """
        self.stop()

    def is_debug_enabled(self):
        """
        Return True if debug is enabled

        Returns:
            bool: True if debug enabled
        """
        return self.debug_enabled

    def set_debug(self, debug):
        """
        Enable or disable debug level. It changes logger level on the fly.

        Args:
            debug (bool): debug enabled if True, otherwise info level
        """
        #change current logger debug level
        if debug:
            self.logger.setLevel(logging.DEBUG)
        else:
            self.logger.setLevel(logging.WARN)

        #update debug flag
        self.debug_enabled = debug

    def stop(self):
        """
        Stop process
        """
        self._stop()
        self.running = False

    def _stop(self):
        """
        Customizable stop
        """
        pass

    def run(self):
        """
        Default process
        """
        while self.running:
            time.sleep(1.0)
    

class CommandError(Exception):
    def __init__(self, value):
        self.value = value
    def __str__(self):
        return repr(self.value)

class CommandInfo(Exception):
    def __init__(self, value):
        self.value = value
    def __str__(self):
        return repr(self.value)

class NoResponse(Exception):
    def __str__(self):
        return repr('No response')

class NoMessageAvailable(Exception):
    def __str__(self):
        return repr('No message available')

class InvalidParameter(Exception):
    def __init__(self, value):
        self.value = value
    def __str__(self):
        return repr(self.value)

class MissingParameter(Exception):
    def __init__(self, value):
        self.value = value
    def __str__(self):
        return repr(self.value)

class InvalidMessage(Exception):
    def __str__(self):
        return repr('Invalid message')

class BusNotReady(Exception):
    def __str__(self):
        return repr('Bus is not ready yet. Please handle system.application.ready event before sending events.')

class InvalidModule(Exception):
    def __init__(self, module):
        self.module = module
    def __str__(self):
        return repr('Invalid module %s (not loaded or unknown)' % module)

class Unauthorized(Exception):
    def __init__(self, value):
        self.value = value
    def __str__(self):
        return repr(self.value)

class BusError(Exception):
    def __init__(self, value):
        self.value = value
    def __str__(self):
        return repr(self.value)

class MessageResponse():
    """ 
    Object that holds message response
    A response is composed of:
     - an error flag: True if error, False otherwise
     - a message: a message about request
     - some data: data returned by the request
    """
    def __init__(self):
        self.error = False
        self.message = ''
        self.data = None

    def __str__(self):
        return '{error:%r, message:%s, data:%s}' % (self.error, self.message, str(self.data))

    def to_dict(self):
        """ 
        Return message response
        """
        return {'error':self.error, 'message':self.message, 'data':self.data}

class MessageRequest():
    """
    Object that holds message request
    A message request is composed of:
     - in case of a command:
       - a command name
       - command parameters
       - the command sender
     - in case of an event:
       - an event name
       - event parameters
       - a device uuid
       - a startup flag that indicates this event was sent during raspiot startup
    """
    def __init__(self):
        self.command = None
        self.event = None
        self.params = {}
        self.to = None
        self.from_ = None
        self.uuid = None

    def __str__(self):
        if self.command:
            return '{command:%s, params:%s, to:%s}' % (self.command, str(self.params), self.to)
        elif self.event:
            return '{event:%s, params:%s, to:%s}' % (self.event, str(self.params), self.to)
        else:
            return 'Invalid message'

    def is_broadcast(self):
        """
        Return True if the request is broadcast
        """
        if self.to==None:
            return True
        else:
            return False

    def to_dict(self, startup=False):
        """
        Return useful dict with data filled
        Internaly usage
        @raise InvalidMessage if message is not valid
        """
        if self.command:
            return {'command':self.command, 'params':self.params, 'from':self.from_}
        elif self.event:
            return {'event':self.event, 'params':self.params, 'startup':startup, 'uuid':self.uuid}
        else:
            raise InvalidMessage()

