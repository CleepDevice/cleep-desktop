#!/usr/bin/env python
# -*- coding: utf-8 -*-
    
import logging
import time
from cleep.libs.console import AdvancedConsole, Console
from cleep.libs.wpasupplicantconf import WpaSupplicantConf
import cleep.libs.converters as Converters
import os

class Iwlist(AdvancedConsole):
    """
    Command /sbin/iwlist helper
    """

    CACHE_DURATION = 5.0

    def __init__(self):
        """
        Constructor
        """
        AdvancedConsole.__init__(self)

        #members
        self._command = u'/sbin/iwlist %s scan last'
        self.timestamp = None
        self.logger = logging.getLogger(self.__class__.__name__)
        #self.logger.setLevel(logging.DEBUG)
        self.networks = {}
        self.error = False
        self.__last_scanned_interface = None

    def __refresh(self, interface):
        """
        Refresh all data

        Args:
            interface (string): interface to scan
        """
        #check if refresh is needed
        if self.timestamp is not None and time.time()-self.timestamp<=self.CACHE_DURATION:
            self.logger.debug('Don\'t refresh')
            return

        self.__last_scanned_interface = interface
        results = self.find(self._command % interface, r'Cell \d+|ESSID:\"(.*?)\"|IE:\s*(.*)|Encryption key:(.*)|Signal level=(\d{1,3})/100|Signal level=(-\d+) dBm', timeout=15.0)

        #handle invalid interface for wifi scanning
        if len(results)==0 and self.get_last_return_code()!=0:
            self.networks = {}
            self.error = True
            return

        current_entry = None
        entries = {}
        for group, groups in results:
            #filter None values
            groups = list(filter(None, groups))

            if group.startswith(u'Cell'):
                current_entry = {
                    u'interface': interface,
                    u'network': None,
                    u'encryption': None,
                    u'signallevel': 0,
                    u'wpa2': False,
                    u'wpa': False,
                    u'encryption_key': None
                }
            elif current_entry is None or len(groups)==0:
                continue
            elif group.startswith(u'ESSID'):
                current_entry[u'network'] = groups[0]
                entries[groups[0]] = current_entry
            elif group.startswith(u'IE') and current_entry is not None and groups[0].lower().find(u'wpa2')>=0:
                current_entry[u'wpa2'] = True
            elif group.startswith(u'IE') and current_entry is not None and groups[0].lower().find(u'wpa')>=0:
                current_entry[u'wpa'] = True
            elif group.startswith(u'Encryption key') and current_entry is not None:
                current_entry[u'encryption_key'] = groups[0]
            elif group.startswith(u'Signal level') and current_entry is not None:
                if groups[0].isdigit():
                    try:
                        current_entry[u'signallevel'] = float(groups[0])
                    except:
                        current_entry[u'signallevel'] = 0
                elif groups[0].startswith(u'-'):
                    try:
                        current_entry[u'signallevel'] = Converters.dbm_to_percent(int(groups[0]))
                    except:
                        current_entry[u'signallevel'] = 0
                else:
                    current_entry[u'signallevel'] = groups[0]
        self.logger.debug('entries: %s' % entries)

        #compute encryption value
        for network in entries:
            if entries[network][u'wpa2']:
                entries[network][u'encryption'] = WpaSupplicantConf.ENCRYPTION_TYPE_WPA2
            elif entries[network][u'wpa']:
                entries[network][u'encryption'] = WpaSupplicantConf.ENCRYPTION_TYPE_WPA
            elif entries[network][u'encryption_key'].lower()=='on':
                entries[network][u'encryption'] = WpaSupplicantConf.ENCRYPTION_TYPE_WEP
            elif entries[network][u'encryption_key'].lower()=='off':
                entries[network][u'encryption'] = WpaSupplicantConf.ENCRYPTION_TYPE_UNSECURED
            else:
                entries[network][u'encryption'] = WpaSupplicantConf.ENCRYPTION_TYPE_UNKNOWN
            del entries[network][u'wpa2']
            del entries[network][u'wpa']
            del entries[network][u'encryption_key']
        
        #save networks and error
        self.networks = entries
        self.error = False

        #update timestamp
        self.timestamp = time.time()

    def is_installed(self):
        """
        Return True if command is installed
        """
        return os.path.exists(u'/sbin/iwlist')

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

