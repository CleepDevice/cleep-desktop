#!/usr/bin/env python
# -*- coding: utf-8 -*-

__all__ = ['CommandError', 'CommandInfo', 'NoResponse', 'NoMessageAvailable', 'InvalidParameter', 'MissingParameter', 
           'InvalidMessage', 'Unauthorized', 'BusError']

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
