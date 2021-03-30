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


class Iwlist(AdvancedConsole):
    """
    Command /sbin/iwlist helper.
    Get list of wifi networks in range.
    """

    CACHE_DURATION = 30.0
    MAX_RETRY = 30
    NO_SCAN_RESULTS = 'No scan results'

    def __init__(self):
        """
        Constructor
        """
        AdvancedConsole.__init__(self)

        #members
        self._command = '/sbin/iwlist %s scan last'
        self.timestamp = None
        self.logger = logging.getLogger(self.__class__.__name__)
        #self.logger.setLevel(logging.DEBUG)
        self.networks = {}
        self.error = False
        self.__last_scanned_interface = None
        self.__cache = {}

    def __refresh(self, interface):
        """
        Refresh all data

        Args:
            interface (string): interface to scan

        Return:
            bool: True if scan ok, False if scan need to be done again (no scan result), None if no refresh performed
        """
        #check if refresh is needed
        if self.timestamp is not None and time.time()-self.timestamp<=self.CACHE_DURATION:
            self.logger.debug('Don\'t refresh')
            return None

        self.__last_scanned_interface = interface
        results = self.find(self._command % interface, r'Cell \d+|ESSID:\"(.*?)\"|IE:\s*(.*)|Encryption key:(.*)|Signal level=(\d{1,3})/100|Signal level=(-\d+) dBm|(No scan results)', timeout=15.0)

        #handle invalid interface for wifi scanning
        if len(results)==0 and self.get_last_return_code()!=0:
            self.networks = {}
            self.error = True
            return None

        current_entry = {}
        entries = {}
        for group, groups in results:
            #filter None values
            groups = list(filter(None, groups))

            #handle "no scan results"
            if group==self.NO_SCAN_RESULTS:
                #need to retry
                return False

            if group.startswith('Cell'):
                current_entry = {
                    'interface': interface,
                    'network': None,
                    'encryption': None,
                    'signallevel': 0,
                    'wpa2': False,
                    'wpa': False,
                    'encryption_key': None
                }
            elif not current_entry or len(groups)==0:
                continue
            elif group.startswith('ESSID'):
                current_entry['network'] = groups[0]
                entries[groups[0]] = current_entry
            elif group.startswith('IE') and current_entry is not None and groups[0].lower().find('wpa2')>=0:
                current_entry['wpa2'] = True
            elif group.startswith('IE') and current_entry is not None and groups[0].lower().find('wpa')>=0:
                current_entry['wpa'] = True
            elif group.startswith('Encryption key') and current_entry is not None:
                current_entry['encryption_key'] = groups[0]
            elif group.startswith('Signal level') and current_entry is not None:
                if groups[0].isdigit():
                    try:
                        current_entry['signallevel'] = float(groups[0])
                    except:
                        current_entry['signallevel'] = 0
                elif groups[0].startswith('-'):
                    try:
                        current_entry['signallevel'] = Converters.dbm_to_percent(int(groups[0]))
                    except:
                        current_entry['signallevel'] = 0
                else:
                    current_entry['signallevel'] = groups[0]
        self.logger.debug('entries: %s' % entries)

        #compute encryption value
        for network in entries:
            if entries[network]['wpa2']:
                entries[network]['encryption'] = WpaSupplicantConf.ENCRYPTION_TYPE_WPA2
            elif entries[network]['wpa']:
                entries[network]['encryption'] = WpaSupplicantConf.ENCRYPTION_TYPE_WPA
            elif entries[network]['encryption_key'].lower()=='on':
                entries[network]['encryption'] = WpaSupplicantConf.ENCRYPTION_TYPE_WEP
            elif entries[network]['encryption_key'].lower()=='off':
                entries[network]['encryption'] = WpaSupplicantConf.ENCRYPTION_TYPE_UNSECURED
            else:
                entries[network]['encryption'] = WpaSupplicantConf.ENCRYPTION_TYPE_UNKNOWN
            del entries[network]['wpa2']
            del entries[network]['wpa']
            del entries[network]['encryption_key']
        
        #save networks and error
        self.networks = entries
        self.error = False

        #update timestamp
        self.timestamp = time.time()

        return True

    def is_installed(self):
        """
        Return True if command is installed
        """
        return os.path.exists('/sbin/iwlist')

    def has_error(self):
        """
        Return True if error occured
        
        Return:
            bool: True if error, False otherwise
        """
        return self.error

    def get_networks(self, interface):
        """
        Return all wifi networks scanned using iwlist.

        Note:
            If iwlist is run without root privileges it returns sometimes no result. To prevent a long
            wait we cache previous scan results. It could be not up to date, but there is no solution for now.

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
        if len(self.__cache.keys())==0:
            #first run, no cache yet, try until networks are returned by iwlist command
            self.logger.debug('No cache yet, try until networks are returned')
            for i in range(self.MAX_RETRY):
                if self.__refresh(interface) is True or None:
                    #scan successful, update cache
                    self.logger.debug('Refresh returns networks. Fill cache')
                    self.__cache = self.networks

                    #and stop statement
                    break

                else:
                    #no network found, retry
                    #self.logger.debug('"No scan results" returned')
                    time.sleep(1)

        else:
            #cache available, try to scan only once
            self.logger.debug('Cache available, try to refresh once')
            if self.__refresh(interface) is True or None:
                #scan was successful, cache refreshed list
                self.__cache = self.networks

            else:
                #refresh failed, return cached networks
                self.logger.debug('Refresh failed, return cached networks')
                pass
        
        #always return cache
        return self.__cache


if __name__ == '__main__':
    import pprint
    pp = pprint.PrettyPrinter(indent=2)

    logging.basicConfig(level=logging.DEBUG)
    
    i = Iwlist()
    networks = i.get_networks('wlan0')
    pp.pprint(networks)