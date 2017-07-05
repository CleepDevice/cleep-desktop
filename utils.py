#!/usr/bin/env python
# -*- coding: utf-8 -*-

__all__ = ['CommandError', 'CommandInfo', 'NoResponse', 'NoMessageAvailable', 'InvalidParameter', 'MissingParameter', 
           'InvalidMessage', 'Unauthorized', 'BusError', 'MessageResponse', 'MessageRequest']

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

