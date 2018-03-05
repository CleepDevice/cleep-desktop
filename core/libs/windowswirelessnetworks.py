#!/usr/bin/env python
# -*- coding: utf-8 -*-

from win32wifi import Win32Wifi
from core.libs.wpasupplicantconf import WpaSupplicantConf
import time
import logging

class WindowsWirelessNetworks():
    """
    Return list of wireless networks in range on Windows environment
    """
    
    CACHE_DURATION = 2.0

    def __init__(self):
        """
        Constructor
        """
        self.logger = logging.getLogger(self.__class__.__name__)
        self.logger.setLevel(logging.DEBUG)
        self.timestamp = None
        self.networks = {}
        
    def __refresh(self, interface):
        """
        Refresh all data (fill self.networks)
        """
        #check if refresh is needed
        if self.timestamp is not None and time.time()-self.timestamp<=self.CACHE_DURATION:
            self.logger.debug('Don\'t refresh')
            return

        #get networks (list of WirelessNetwork https://github.com/kedos/win32wifi/blob/master/win32wifi/Win32Wifi.py#L65)
        scanned_networks = Win32Wifi.getWirelessAvailableNetworkList(interface)

        #format output to useful format
        networks = {}
        for network in scanned_networks:
            #handle signal level
            signal_level = 0
            try:
                signal_level = float(network.signal_quality)
            except:
                self.logger.debug('Invalid signal level %s' % network.signal_quality)

            #handle encryption
            encryption = WpaSupplicantConf.ENCRYPTION_TYPE_UNKNOWN
            if network.auth=='DOT11_AUTH_ALGO_80211_OPEN':
                #security disabled
                encryption = WpaSupplicantConf.ENCRYPTION_TYPE_UNSECURED
            elif network.auth=='DOT11_AUTH_ALGO_80211_SHARED_KEY':
                #wep
                encryption = WpaSupplicantConf.ENCRYPTION_TYPE_WEP
            elif network.auth in ('DOT11_AUTH_ALGO_WPA', 'DOT11_AUTH_ALGO_WPA_PSK'):
                #wpa
                encryption = WpaSupplicantConf.ENCRYPTION_TYPE_WPA
            elif network.auth in ('DOT11_AUTH_ALGO_RSNA', 'DOT11_AUTH_ALGO_RSNA_PSK'):
                #wpa2
                encryption = WpaSupplicantConf.ENCRYPTION_TYPE_WPA2

            networks[network.ssid] = {
                'interface': interface.guid_string,
                'network': network.ssid.decode('utf-8'),
                'encryption': encryption,
                'signallevel': signal_level
            }
       
        #save networks
        self.networks = networks

        #update timestamp
        self.timestamp = time.time()

    def get_networks(self, interface):
        """
        Return all wifi networks scanned

        Args:
            interface (WirelessInterface): interface name

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
        if interface is None:
            raise Exception('Parameter interface is missing')

        #refresh list of networks
        self.__refresh(interface)

        return self.networks
     
        
        
if __name__ == '__main__':
    import pprint
    pp = pprint.PrettyPrinter(indent=2)
    
    n = WindowsWirelessNetworks()
    networks = n.get_networks()
    pp.pprint(networks)
