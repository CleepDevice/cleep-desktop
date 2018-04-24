#!/usr/bin/env python
# -*- coding: utf-8 -*-
    
import logging
import time
import os
try:
    from core.libs.console import AdvancedConsole, Console
except:
    from console import AdvancedConsole, Console
try:
    from core.libs.wpasupplicantconf import WpaSupplicantConf
except:
    from wpasupplicantconf import WpaSupplicantConf
try:
    import core.libs.converters as Converters
except:
    import converters as Converters


class Nmcli(AdvancedConsole):
    """
    Command /sbin/iwlist helper.
    Get list of wifi networks in range.
    """

    CACHE_DURATION = 30.0
    MAX_RETRY = 30
    NO_SCAN_RESULTS = u'No scan results'

    def __init__(self):
        """
        Constructor
        """
        AdvancedConsole.__init__(self)

        #members
        self._command = u'/usr/bin/nmcli -f SSID,SIGNAL,SECURITY dev wifi list'
        self.timestamp = None
        self.logger = logging.getLogger(self.__class__.__name__)
        #self.logger.setLevel(logging.DEBUG)
        self.networks = {}

    def __refresh(self):
        """
        Refresh all data

        Return:
            bool: True if scan ok, False if scan need to be done again (no scan result), None if no refresh performed
        """
        results = self.find(self._command, r'^(.*)\s+(\d+)\s+(.*)$', timeout=5.0)

        #handle invalid interface for wifi scanning
        if len(results)==0 and self.get_last_return_code()!=0:
            self.networks = {}
            self.error = True
            return None

        entries = {}
        for group, groups in results:
            #filter None values
            groups = list(filter(None, groups))
            #self.logger.debug(groups)

            #get network name
            network = groups[0].strip()

            #get encryption
            encryption = WpaSupplicantConf.ENCRYPTION_TYPE_UNKNOWN
            if groups[2].lower().find('wpa2'):
                encryption = WpaSupplicantConf.ENCRYPTION_TYPE_WPA2
            elif groups[2].lower().find('wpa1'):
                encryption = WpaSupplicantConf.ENCRYPTION_TYPE_WPA
            elif groups[2].lower().find('wep'):
                encryption = WpaSupplicantConf.ENCRYPTION_TYPE_WEP
            elif groups[2].lower().find('--'):
                encryption = WpaSupplicantConf.ENCRYPTION_TYPE_UNSECURED

            #get signal level
            try:
                signal_level = float(groups[1])
            except:
                self.logger.exception('Unable to convert to float signal level value "%s":' % groups[1])
                signal_level = 0

            #create entry
            entries[network] = {
                'interface': None,
                'network': network,
                'encryption': encryption,
                'signallevel': signal_level
            }
        
        #save networks and error
        self.networks = entries
        self.error = False

    def is_installed(self):
        """
        Return True if command is installed
        """
        return os.path.exists(u'/usr/bin/nmcli')

    def has_error(self):
        """
        Return True if error occured
        
        Return:
            bool: True if error, False otherwise
        """
        return self.error

    def get_networks(self):
        """
        Return all wifi networks scanned using iwlist.

        Note:
            If iwlist is run without root privileges it returns sometimes no result. To prevent a long
            wait we cache previous scan results. It could be not up to date, but there is no solution for now.

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
            bool: True if interface is not able to scan wifi
        """
        self.__refresh()
        return self.networks


if __name__ == '__main__':
    import pprint
    pp = pprint.PrettyPrinter(indent=2)

    logging.basicConfig(level=logging.DEBUG)
    
    i = Nmcli()
    networks = i.get_networks()
    pp.pprint(networks)