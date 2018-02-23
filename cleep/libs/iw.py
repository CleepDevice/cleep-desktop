#!/usr/bin/env python
# -*- coding: utf-8 -*-
    
import logging
from cleep.libs.console import AdvancedConsole, Console
import time
import os

class Iw(AdvancedConsole):
    """
    Command /sbin/iw helper
    """

    CACHE_DURATION = 5.0

    def __init__(self):
        """
        Constructor
        """
        AdvancedConsole.__init__(self)

        #members
        self._command = u'/sbin/iw dev'
        self.logger = logging.getLogger(self.__class__.__name__)
        #self.logger.setLevel(logging.DEBUG)
        self.connections = {}
        self.timestamp = None

    def is_installed(self):
        """
        Return True if iw command is installed

        Return:
            bool: True is installed
        """
        return os.path.exists(u'/sbin/iw')

    def __refresh(self):
        """
        Refresh all data
        """
        #check if refresh is needed
        if self.timestamp is not None and time.time()-self.timestamp<=self.CACHE_DURATION:
            self.logger.debug('Don\'t refresh')
            return

        results = self.find(self._command, r'Interface\s(.*?)\s|ssid\s(.*?)\s')
        if len(results)==0:
            self.connections = {}
            return
    
        entries = {}
        current_entry = None
        for group, groups in results:
            #filter non values
            groups = list(filter(None, groups))
        
            if group.startswith(u'ssid') and current_entry is not None:
                current_entry[u'network'] = groups[0]
            elif group.startswith(u'Interface'):
                current_entry = {
                    u'interface': groups[0],
                    u'network': None
                }
                entries[groups[0]] = current_entry

            elif group.startswith(u'ssid') and current_entry is not None:
                current_entry[u'network'] = groups[0]

        #save connections
        self.connections = entries

        #update timestamp
        self.timestamp = time.time()

    def get_connections(self):
        """
        Return all connections

        Return:
            dict: list of connections
        """
        self.__refresh()

        return self.connections

