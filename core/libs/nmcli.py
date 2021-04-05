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
    Command /usr/bin/nmcli helper.
    Get list of wifi networks in range.
    """

    CACHE_DURATION = 30.0
    MAX_RETRY = 30
    NO_SCAN_RESULTS = 'No scan results'

    TYPE_UNKNOWN = 'unknown'
    TYPE_WIFI = 'wifi'
    TYPE_ETHERNET = 'ethernet'

    STATE_CONNECTED = 'connected'
    STATE_DISCONNECTED = 'disconnected'

    def __init__(self):
        """
        Constructor
        """
        AdvancedConsole.__init__(self)

        # members
        self._command_wifi_networks = '/usr/bin/nmcli -f SSID,SIGNAL,SECURITY dev wifi list'
        self._command_interfaces = '/usr/bin/nmcli -f TYPE,STATE,DEVICE device'
        self.timestamp = None
        self.logger = logging.getLogger(self.__class__.__name__)
        # self.logger.setLevel(logging.DEBUG)
        self.networks = {}

    def __refresh(self, interface):
        """
        Refresh all data

        Return:
            bool: True if scan ok, False if scan need to be done again (no scan result), None if no refresh performed
        """
        results = self.find(self._command_wifi_networks, r'^(.*)\s+(\d+)\s+(.*)$', timeout=5.0)

        entries = {}
        for _, groups in results:
            # filter None values
            groups = list(filter(None, groups))
            # self.logger.debug(groups)

            # get network name
            network = groups[0].strip()

            # get encryption
            encryption = WpaSupplicantConf.ENCRYPTION_TYPE_UNKNOWN
            if groups[2].lower().find('wpa2')>=0:
                encryption = WpaSupplicantConf.ENCRYPTION_TYPE_WPA2
            elif groups[2].lower().find('wpa1')>=0:
                encryption = WpaSupplicantConf.ENCRYPTION_TYPE_WPA
            elif groups[2].lower().find('wep')>=0:
                encryption = WpaSupplicantConf.ENCRYPTION_TYPE_WEP
            elif groups[2].lower().find('--')>=0:
                encryption = WpaSupplicantConf.ENCRYPTION_TYPE_UNSECURED

            # get signal level
            try:
                signal_level = float(groups[1])
            except:
                self.logger.exception('Unable to convert to float signal level value "%s":' % groups[1])
                signal_level = 0

            # create entry
            entries[network] = {
                'interface': interface,
                'network': network,
                'encryption': encryption,
                'signallevel': signal_level
            }
        
        # save networks
        self.networks = entries

    def is_installed(self):
        """
        Return True if command is installed
        """
        return os.path.exists('/usr/bin/nmcli')

    def get_interfaces(self):
        """
        Return all network interfaces

        Return:
            dict: dict or interfaces with their type::
                {
                    interface: {
                        name (string): interface name
                        type (string): interface type (see TYPE_XXX)
                        connected (bool): True if connected
                    }
                }
        """
        results = self.find(self._command_interfaces, r'^(wifi|ethernet|loopback)\s+(disconnected|connected|unavailable|unmanaged)\s+(.*)$', timeout=5.0)
        # self.logger.debug(results)

        # handle errors
        if len(results)==0 and self.get_last_return_code()!=0:
            return {}

        entries = {}
        for _, groups in results:
            # filter None values
            groups = list(filter(None, groups))
            # self.logger.debug(groups)

            # get type
            type_ = self.TYPE_UNKNOWN
            if groups[0].lower()==self.TYPE_ETHERNET:
                type_ = self.TYPE_ETHERNET
            if groups[0].lower()==self.TYPE_WIFI:
                type_ = self.TYPE_WIFI

            # get state
            connected = False
            if groups[1].lower()==self.STATE_CONNECTED:
                connected = True

            # interface name
            name = groups[2]

            # create entry
            entries[name] = {
                'interface': name,
                'type': type_,
                'connected': connected
            }
        
        return entries

    def get_wifi_interfaces(self):
        """
        Return wifi interfaces names

        Return:
            list: list of interfaces names
        """
        out = []

        interfaces = self.get_interfaces()
        for interface in interfaces:
            if interfaces[interface]['type']==self.TYPE_WIFI:
                out.append(interface)

        return out

    def get_wifi_networks(self, interface):
        """
        Return all wifi networks scanned using nmcli command.

        Args:
            interface (string): interface to scan 

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


if __name__ == '__main__':
    import pprint
    pp = pprint.PrettyPrinter(indent=2)

    logging.basicConfig(level=logging.DEBUG)
    
    i = Nmcli()

    interfaces = i.get_interfaces()
    pp.pprint(interfaces)

    wifi_interfaces = i.get_wifi_interfaces()
    pp.pprint(wifi_interfaces)

    networks = i.get_wifi_networks(wifi_interfaces[0])
    pp.pprint(networks)
