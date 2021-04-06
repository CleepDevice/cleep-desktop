#!/usr/bin/env python
# -*- coding: utf-8 -*-

import logging
import time
from core.libs.console import AdvancedConsole
from core.libs.wpasupplicantconf import WpaSupplicantConf
import core.libs.tools as Tools

class Iwlist(AdvancedConsole):
    """
    Command /sbin/iwlist helper
    """

    CACHE_DURATION = 2.0

    FREQ_2_4GHZ = '2.4GHz'
    FREQ_5GHZ = '5GHz'

    def __init__(self):
        """
        Constructor
        """
        AdvancedConsole.__init__(self)

        # members
        self._command = '/sbin/iwlist %s scan'
        self.timestamp = None
        self.logger = logging.getLogger(self.__class__.__name__)
        # self.logger.setLevel(logging.DEBUG)
        self.networks = {}
        self.error = False
        self.__last_scanned_interface = None

    def __refresh(self, interface):
        """
        Refresh all data

        Args:
            interface (string): interface to scan
        """
        # check if refresh is needed
        if self.timestamp is not None and time.time()-self.timestamp <= self.CACHE_DURATION:
            self.logger.trace('Don\'t refresh')
            return

        self.__last_scanned_interface = interface
        results = self.find(
            self._command % interface,
            r'Cell \d+|ESSID:\"(.*?)\"|IE:\s*(.*)|Encryption key:(.*)|Signal level=(\d{1,3})/100|Signal level=(-\d+) dBm|Frequency:(\d+\.\d+) GHz',
            timeout=15.0
        )
        # self.logger.trace('Results: %s' % results)

        # handle invalid interface for wifi scanning
        if len(results) == 0 and self.get_last_return_code() != 0:
            self.networks = {}
            self.error = True
            return

        current_entry = {}
        entries = {}
        frequency = None
        for group, groups in results:
            # filter None values
            groups = list(filter(lambda v: v is not None, groups))

            if group.startswith('Cell'):
                # create new empty entry
                current_entry = {
                    'interface': interface,
                    'network': None,
                    'encryption': None,
                    'signallevel': 0,
                    'wpa2': False,
                    'wpa': False,
                    'encryption_key': '',
                    'frequencies': []
                }

            elif group.startswith('ESSID'):
                # network
                if len(groups[0]) > 0 and groups[0] not in entries:
                    # new network detected, store item in final entries list
                    current_entry['network'] = groups[0]
                    if frequency is not None:
                        current_entry['frequencies'].append(frequency) # pylint: disable=E1136
                    entries[groups[0]] = current_entry

                elif len(groups[0]) > 0 and frequency is not None:
                    # append frequency on existing entry
                    if frequency not in entries[groups[0]]['frequencies']:
                        entries[groups[0]]['frequencies'].append(frequency)

                # reset frequency
                frequency = None

            elif group.startswith('IE') and current_entry is not None and groups[0].lower().find('wpa2') >= 0:
                # wpa2
                current_entry['wpa2'] = True

            elif group.startswith('IE') and current_entry is not None and groups[0].lower().find('wpa') >= 0:
                # wpa
                current_entry['wpa'] = True

            elif group.startswith('Encryption key') and current_entry:
                # encryption key (wep or unsecured)
                current_entry['encryption_key'] = groups[0]

            elif group.startswith('Frequency'):
                # frequency
                if groups[0].startswith('2.'):
                    frequency = self.FREQ_2_4GHZ
                elif groups[0].startswith('5.'):
                    frequency = self.FREQ_5GHZ

            elif group.startswith('Signal level') and current_entry:
                # signal level
                if groups[0].isdigit():
                    current_entry['signallevel'] = int(groups[0])
                elif groups[0].startswith('-'):
                    current_entry['signallevel'] = Tools.dbm_to_percent(int(groups[0]))

        # log entries
        self.logger.debug('Entries: %s' % entries)

        # compute encryption value
        for network in entries:
            if entries[network]['wpa2']:
                entries[network]['encryption'] = WpaSupplicantConf.ENCRYPTION_TYPE_WPA2
            elif entries[network]['wpa']:
                entries[network]['encryption'] = WpaSupplicantConf.ENCRYPTION_TYPE_WPA
            elif entries[network]['encryption_key'].lower() == 'on':
                entries[network]['encryption'] = WpaSupplicantConf.ENCRYPTION_TYPE_WEP
            elif entries[network]['encryption_key'].lower() == 'off':
                entries[network]['encryption'] = WpaSupplicantConf.ENCRYPTION_TYPE_UNSECURED
            else:
                entries[network]['encryption'] = WpaSupplicantConf.ENCRYPTION_TYPE_UNKNOWN
            del entries[network]['wpa2']
            del entries[network]['wpa']
            del entries[network]['encryption_key']

        # save networks and error
        self.networks = entries
        self.error = False

        # update timestamp
        self.timestamp = time.time()

    def has_error(self):
        """
        Return True if error occured

        Returns:
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
                        frequencies (list): list of supported frequencies
                    },
                    ...
                }

        """
        self.__refresh(interface)

        return self.networks
