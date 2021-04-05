#!/usr/bin/env python
# -*- coding: utf-8 -*-

import logging
import os
import time
try:
    from core.libs.console import AdvancedConsole
except:
    from console import AdvancedConsole
try:
    import core.libs.converters as Converters
except:
    import converters as Converters
try:
    from core.libs.wpasupplicantconf import WpaSupplicantConf
except:
    from wpasupplicantconf import WpaSupplicantConf

class MacWirelessNetworks(AdvancedConsole):
    """
    Return list of wireless networks
    """

    CACHE_DURATION = 2.0
    
    def __init__(self):
        """
        Constructor
        """
        AdvancedConsole.__init__(self)

        # members
        self._binary = '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport'
        self._command = '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport --scan'
        self.logger = logging.getLogger(self.__class__.__name__)
        self.networks = {}
        self.error = False
        self.timestamp = None
        self.__last_scanned_interface = None

    def is_installed(self):
        """ 
        Return True if command binary exists

        Return:
            bool: True if binary exists
        """
        return os.path.exists(self._binary)

    def __refresh(self, interface):
        """
        Refresh list of networks
        """
        # check if refresh is needed
        if self.timestamp is not None and time.time()-self.timestamp<=self.CACHE_DURATION and self.__last_scanned_interface==interface:
            self.logger.debug('Don\'t refresh')
            return

        # execute command
        self.__last_scanned_interface = interface
        results = self.find(self._command, r'\s+(.*?)\s+(?:(?:.{2}:){5}.{2})\s+(-\d+)\s+(?:.*)\s+(?:Y|N)\s+.{2}\s+(.*)', timeout=15.0)
        self.logger.debug(results)

        # handle invalid interface for wifi scanning or disabled interface
        if len(results)==0 and self.get_last_return_code()!=0:
            self.networks = {}
            self.error = True
            return

        # parse results
        entries = {}
        for _, groups in results:
            # filter None values
            groups = list(filter(None, groups))
            self.logger.debug(groups)

            # handle encryption
            encryption = groups[2].lower()
            if encryption.find('wpa2')!=-1:
                encryption = WpaSupplicantConf.ENCRYPTION_TYPE_WPA2
            elif encryption.find('wpa')!=-1:
                encryption = WpaSupplicantConf.ENCRYPTION_TYPE_WPA
            elif encryption.find('wep')!=-1:
                encryption = WpaSupplicantConf.ENCRYPTION_TYPE_WEP
            elif encryption.find('none')!=-1:
                encryption = WpaSupplicantConf.ENCRYPTION_TYPE_UNSECURED
            else:
                encryption = WpaSupplicantConf.ENCRYPTION_TYPE_UNKNOWN

            # handle signal level
            signal_level = Converters.dbm_to_percent(int(groups[1]))

            # save entry
            entries[groups[0]] = {
                'interface': interface,
                'network': groups[0],
                'encryption': encryption,
                'signallevel': signal_level
            }
        self.logger.debug('entries: %s' % entries)

        # save networks and error
        self.networks = entries
        self.error = False

    def has_error(self):
        """
        Return True if error occured
        
        Return:
            bool: True if error, False otherwise
        """
        return self.error

    def get_networks(self, interface):
        """
        Return all wifi networks scanned

        Args:
            interface (string): interface name

        Returns:
            dict: dictionnary of found wifi networks::
                {
                    network: {
                        interface (string): interface scanned
                        network (string): wifi network name
                        encryption (string): encryption type (TODO)
                        signallevel (float): wifi signal level
                    },
                    ...
                }
        """
        self.__refresh(interface)

        return self.networks

if __name__ == '__main__':
    import pprint
    pp = pprint.PrettyPrinter(indent=2)

    logging.basicConfig(level=logging.DEBUG)

    m = MacWirelessNetworks()
    nets = m.get_networks('en1')
    pp.pprint(nets)


