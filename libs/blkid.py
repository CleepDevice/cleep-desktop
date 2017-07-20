#!/usr/bin/env python
# -*- coding: utf-8 -*-

from console import Console
import re
import time

class Blkid():

    CACHE_DURATION = 5.0

    def __init__(self):
        self.console = Console()
        self.timestamp = None
        self.__devices = {}
        self.__uuids = {}

    def __refresh(self):
        #check if refresh is needed
        if self.timestamp is not None and time.time()-self.timestamp<=self.CACHE_DURATION:
            return

        res = self.console.command(u'/sbin/blkid')
        if not res[u'error'] and not res[u'killed']:
            #parse data
            matches = re.finditer(r'^(\/dev\/.*?):.*UUID=\"(.*?)\"\s+.*$', u'\n'.join(res[u'stdout']), re.UNICODE | re.MULTILINE)
            for matchNum, match in enumerate(matches):
                groups = match.groups()
                if len(groups)==2:
                    self.__devices[groups[0]] = groups[1]
                    self.__uuids[groups[1]] = groups[0]

        self.timestamp = time.time()

    def get_devices(self):
        self.__refresh()

        return self.__devices

    def get_device(self, uuid):
        self.__refresh()

        if self.__uuids.has_key(uuid):
            return self.__uuids[uuid]

        return None

    def get_uuid(self, device):
        self.__refresh()

        if self.__devices.has_key(device):
            return self.__devices[device]

        return None

