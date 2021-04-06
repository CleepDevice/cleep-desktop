#!/usr/bin/env python
# -*- coding: utf-8 -*-

__all__ = ['MessageResponse', 'MessageRequest', 'CleepDesktopModule', 'AppContext', 'AppPaths']

from threading import Thread
import logging
import time
from core.exception import CommandError, InvalidMessage

class AppPaths():
    app = None
    config = None
    cache = None

class AppContext():
    # Logger: main logger instance
    main_logger = None
    # string: log filepath
    log_filepath = None
    # Config: application config instance
    config = None
    # CrashReport: crash report instance
    crash_report = None
    # AppPaths: application paths
    paths = AppPaths()
    # function: callback to ui update
    update_ui = None
    # list of internal modules
    modules = {}

class CleepDesktopModule(Thread):
    """
    CleepDesktopModule handles default behavior for CleepDesktop module
    """
    def __init__(self, context, debug_enabled):
        """
        Constructor

        Args:
            debug_enabled (bool): flag to set debug level to logge
            crash_report (CrashReport): crash report instance
        """
        Thread.__init__(self)
        Thread.daemon = True

        # init logger
        self.logger = logging.getLogger(self.__class__.__name__)
        if debug_enabled:
            self.logger.setLevel(logging.DEBUG)
        self.debug_enabled = debug_enabled

        # members
        self.context = context
        self.crash_report = context.crash_report
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
        # change current logger debug level
        if debug:
            self.logger.setLevel(logging.DEBUG)
        else:
            self.logger.setLevel(logging.WARN)

        # update debug flag
        self.debug_enabled = debug

    def stop(self):
        """
        Stop process
        """
        self._custom_stop()
        self.running = False

    def _configure(self):
        """
        Customizable module configuration
        """
        pass

    def _custom_stop(self):
        """
        Customizable stop
        """
        pass

    def _custom_process(self):
        """
        Customizable task
        """
        pass

    def execute_command(self, command, params):
        """
        Execute specified command specifying parameters

        Args:
            commmand (string): command to execute
            params (dict): command parameters
        """
        if not hasattr(self, command):
            raise CommandError('Command "%s" not found in "%s"' % (command, self.__class__.__name__))

        module_function = getattr(self, command)
        return module_function(**params)

    def run(self):
        """
        Default process
        """
        self.logger.debug('%s thread started' % self.__class__.__name__)

        self._configure()

        while self.running:
            self._custom_process()
            time.sleep(0.10)

        self.logger.debug('%s thread stopped' % self.__class__.__name__)
    
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
        return {
            'error': self.error,
            'message': self.message,
            'data':self.data
        }

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
            return {
                'command': self.command,
                'params': self.params,
                'from': self.from_
            }
        elif self.event:
            return {
                'event': self.event,
                'params': self.params,
                'startup': startup,
                'uuid': self.uuid
            }
        else:
            raise InvalidMessage()

