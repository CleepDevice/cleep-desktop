#!/usr/bin/env python
# -*- coding: utf-8 -*-

import logging
import time
import re
import os
try:
    from core.libs.console import AdvancedConsole
except:
    from console import AdvancedConsole
try:
    import core.libs.converters as Converters
except:
    import converters as Converters

class MacWirelessInterfaces(AdvancedConsole):
    """
    Return list of wireless interface names
    """

    CACHE_DURATION = 10.0
    WIFI = u'Wi-Fi'
    
    def __init__(self):
        """
        Constructor
        """
        AdvancedConsole.__init__(self)

        #members
        self._binary = u'/usr/sbin/networksetup'
        self._command = u'/usr/sbin/networksetup -listallhardwareports'
        self.logger = logging.getLogger(self.__class__.__name__)
        self.interfaces = {}
        self.timestamp = None

    def is_installed(self):
        """
        Return True if command binary exists

        Return:
            bool: True if binary exists
        """
        return os.path.exists(self._binary)

    def __refresh(self):
        """
        Refresh list of interfaces
        """
        #check if refresh is needed
        if self.timestamp is not None and time.time()-self.timestamp<=self.CACHE_DURATION:
            self.logger.debug('Don\'t refresh')
            return

        #execute command
        results = self.find(self._command, r'(?:Hardware Port:\s+(.*?)[\n\r\0]Device:\s+(.*?)[\n\r\0])', re.UNICODE | re.DOTALL, timeout=5.0)
        self.logger.debug(results)

        #parse results
        entries = []
        for group, groups in results:
            #filter None values
            groups = list(filter(None, groups))
            self.logger.debug('groups=%s' % groups)

            if groups[0].startswith(self.WIFI):
                #it's wifi interface
                entries.append(groups[1])
        self.logger.debug('entries: %s' % entries)

        #save interfaces
        self.interfaces = entries

        #update timestamp
        self.timestamp = time.time()

    def get_interfaces(self):
        """
        Return all interfaces

        Return:
            list: list of wifi interfaces
        """
        self.__refresh()

        return self.interfaces

if __name__ == '__main__':
    import pprint
    pp = pprint.PrettyPrinter(indent=2)

    logging.basicConfig(level=logging.DEBUG)

    m = MacWirelessInterfaces()
    ints = m.get_interfaces()
    pp.pprint(ints)


