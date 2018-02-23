#!/usr/bin/env python
# -*- coding: utf-8 -*-
    
import logging
import time
from console import AdvancedConsole, Console
from wpasupplicantconf import WpaSupplicantConf

class WindowsNetsh(AdvancedConsole):
    """
    netsh windows command helper: get list of wireless network in range

    Resources:
        - https://superuser.com/a/991484
    """

    CACHE_DURATION = 5.0

    def __init__(self):
        """
        Constructor
        """
        AdvancedConsole.__init__(self)

        #member
        self.logger = logging.getLogger(self.__class__.__name__)
        self.logger.setLevel(logging.DEBUG)
        self.__last_scanned_interface = None
        self._command = u'netsh wlan show networks'
        self.timestamp = None
        self.networks = {}
        self.error = False

    def __refresh(self, interface):
        """
        Refresh all data

        Args:
            interface (string): interface to scan
        """
        #check if refresh is needed
        if self.timestamp is not None and time.time()-self.timestamp<=self.CACHE_DURATION and self.__last_scanned_interface==interface:
           self.logger.debug('Don\'t refresh')
           return

        self.__last_scanned_interface = interface
        results = self.find(self._command, r'SSID\s+\d+\s+:\s+(.*)|Authentication\s+:\s+(.*)', timeout=15.0)

        #handle invalid interface for wifi scanning
        if len(results)==0 and self.get_last_return_code()!=0:
            self.networks = {}
            self.error = True
            return

        #parse results
        current_entry = None
        entries = {}
        for group, groups in results:
            #filter None values
            groups = list(filter(None, groups))

            if group.startswith(u'SSID'):
                current_entry = {
                    u'interface': interface,
                    u'network': groups[0],
                    u'encryption': None,
                    u'signallevel': 0
                }
            elif group.startswith(u'Authentication') and groups[0].lower().find(u'wpa2')
                current_entry[u'encryption'] = WpaSupplicantConf.ENCRYPTION_TYPE_WPA2
            elif group.startswith(u'Authentication') and groups[0].lower().find(u'wpa')
                current_entry[u'encryption'] = WpaSupplicantConf.ENCRYPTION_TYPE_WPA
            #TODO other encryptions

        #save networks and error
        self.networks = entries
        self.error = False

        #update timestamp
        self.timestamp = time.time() 

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
            bool: True if interface is not able to scan wifi
        """
        self.__refresh(interface)

        return self.networks

