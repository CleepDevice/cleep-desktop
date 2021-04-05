#!/usr/bin/env python
# -*- coding: utf-8 -*-
    
import logging
try:
    from core.libs.console import AdvancedConsole, Console
except: # pragma no cover
    from console import AdvancedConsole, Console
import time
import os

class Iw(AdvancedConsole):
    """
    Command /sbin/iw helper.
    Return wireless network interface infos.
    """

    CACHE_DURATION = 5.0

    def __init__(self):
        """
        Constructor
        """
        AdvancedConsole.__init__(self)

        # members
        self._command = u'/sbin/iw dev'
        self.logger = logging.getLogger(self.__class__.__name__)
        # self.logger.setLevel(logging.DEBUG)
        self.adapters = {}
        self.timestamp = None

    def is_installed(self):
        """
        Return True if iw command is installed

        Returns:
            bool: True is installed
        """
        return os.path.exists(u'/sbin/iw')

    def __refresh(self):
        """
        Refresh all data
        """
        # check if refresh is needed
        if self.timestamp is not None and time.time()-self.timestamp<=self.CACHE_DURATION: # pragma no cover
            self.logger.trace('Use cached data')
            return

        results = self.find(self._command, r'Interface\s(.*?)\s|ssid\s(.*?)\s')
        if len(results)==0: # pragma no cover: unable to test if no interface
            self.adapters = {}
            return
    
        entries = {}
        current_entry = None
        for group, groups in results:
            # filter non values
            groups = list(filter(None, groups))
        
            if group.startswith(u'ssid') and current_entry is not None:
                # pylint: disable=E1137
                current_entry[u'network'] = groups[0]

            elif group.startswith(u'Interface'):
                current_entry = {
                    u'interface': groups[0],
                    u'network': None
                }
                entries[groups[0]] = current_entry

            elif group.startswith(u'ssid') and current_entry is not None:
                # pylint: disable=E1137
                current_entry[u'network'] = groups[0]

        # save adapters
        self.adapters = entries

        # update timestamp
        self.timestamp = time.time()

    def get_adapters(self):
        """
        Return all adapters with associated interface

        Returns:
            dict: list of adapters and connected network::

                {
                    adapter (string): {
                        interface (string): associated interface name
                        network (string): connected network
                    },
                    ...
                }

        """
        self.__refresh()

        return self.adapters

