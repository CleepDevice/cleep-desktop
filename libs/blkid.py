#!/usr/bin/env python
# -*- coding: utf-8 -*-

try:
    from console import Console
except:
    from libs.console import Console
import re
import time

class Blkid():

    CACHE_DURATION = 5.0

    def __init__(self):
        self.console = Console()
        self.timestamp = None
        self.devices = {}
        self.uuids = {}

    def __refresh(self):
        """
        Refresh data
        """
        #check if refresh is needed
        if self.timestamp is not None and time.time()-self.timestamp<=self.CACHE_DURATION:
            return

        res = self.console.command(u'/sbin/blkid')
        if not res[u'error'] and not res[u'killed']:
            #parse data
            matches = re.finditer(r'^(\/dev\/.*?):.*\s+UUID=\"(.*?)\"\s+.*$', u'\n'.join(res[u'stdout']), re.UNICODE | re.MULTILINE)
            for matchNum, match in enumerate(matches):
                groups = match.groups()
                if len(groups)==2:
                    self.devices[groups[0]] = groups[1]
                    self.uuids[groups[1]] = groups[0]

        self.timestamp = time.time()

    def get_devices(self):
        """
        Get all devices infos

        Return:
            dict: dict of devices
        """
        self.__refresh()
        return self.devices

    def get_device_by_uuid(self, uuid):
        """
        Get device specified by uuid

        Args:
            uuid (string): device uuid

        Return:
            dict: dict of device infos
        """
        self.__refresh()

        if uuid in self.uuids:
            return self.uuids[uuid]

        return None

    def get_device(self, device):
        """
        Get device

        Args:
            device (string): device to search for

        Return:
            dict: dict of device infos
        """
        self.__refresh()

        if device in self.devices:
            return self.devices[device]

        return None

