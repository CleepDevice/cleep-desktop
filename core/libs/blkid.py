#!/usr/bin/env python
# -*- coding: utf-8 -*-

from core.libs.console import Console
import re
import time

class Blkid(Console):

    CACHE_DURATION = 5.0

    def __init__(self):
        """
        Constructor
        """
        Console.__init__(self)

        # set members
        self.timestamp = None
        self.devices = {}

    def __refresh(self):
        """
        Refresh data
        """
        # check if refresh is needed
        if self.timestamp is not None and time.time()-self.timestamp<=self.CACHE_DURATION:
            self.logger.trace('Use cached data')
            return

        res = self.command(u'/sbin/blkid')
        if not res[u'error'] and not res[u'killed']:
            #parse data
            matches = re.finditer(r'^(\/dev\/.*?):.*\s+UUID=\"(.*?)\"\s+.*TYPE=\"(.*?)\"\s+.*PARTUUID=\"(.*?)\"$', u'\n'.join(res[u'stdout']), re.UNICODE | re.MULTILINE)
            for _, match in enumerate(matches):
                groups = match.groups()
                # group[0] = device
                # group[1] = UUID
                # group[2] = TYPE
                # group[3] = PARTUUID
                if len(groups)==4:
                    data = {
                        u'device': groups[0],
                        u'uuid': groups[1],
                        u'type': groups[2],
                        u'partuuid': groups[3],
                    }
                    self.devices[data[u'device']] = data

        self.timestamp = time.time()

    def get_devices(self):
        """
        Get all devices infos

        Returns:
            dict: dict of devices::

                {
                    device (string): {
                        device (string): device path,
                        uuid (string): device uuid,
                        type (string): device filesystem type,
                        partuuid (string): device partuuid
                    },
                    ...
                }

        """
        self.__refresh()
        return self.devices

    def get_device_by_uuid(self, uuid):
        """
        Get device specified by uuid

        Args:
            uuid (string): device uuid

        Returns:
            dict: device data::

                {
                    device (string): device path,
                    uuid (string): device uuid,
                    type (string): device filesystem type,
                    partuuid (string): device partuuid
                }

        """
        self.__refresh()
        for device in self.devices.values():
            if device[u'uuid']==uuid:
                return device
        return None

    def get_device_by_partuuid(self, partuuid):
        """
        Get device specified by partuuid

        Args:
            partuuid (string): device partuuid

        Returns:
            dict: device data::

                {
                    device (string): device path,
                    uuid (string): device uuid,
                    type (string): device filesystem type,
                    partuuid (string): device partuuid
                }

        """
        self.__refresh()
        for device in self.devices.values():
            if device[u'partuuid']==partuuid:
                return device
        return None

    def get_device(self, device):
        """
        Get device

        Args:
            device (string): device to search for

        Returns:
            dict: device data::

                {
                    device (string): device path,
                    uuid (string): device uuid,
                    type (string): device filesystem type,
                    partuuid (string): device partuuid
                }

        """
        self.__refresh()
        return self.devices[device] if device in self.devices.keys() else None


