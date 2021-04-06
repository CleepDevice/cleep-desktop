#!/usr/bin/env python
# -*- coding: utf-8 -*-

from core.libs.console import Console
import re
import time
import logging

class Lsblk(Console):
    """
    """

    CACHE_DURATION = 2.0

    def __init__(self):
        """
        Constructor
        """
        Console.__init__(self)

        # members
        self.logger = logging.getLogger(self.__class__.__name__)
        self.timestamp = None
        self.devices = {}
        self.partitions = []

    def __refresh(self):
        """
        Refresh all data

        Returns:
            dict: partitions infos::

                {
                    drive partition name (string): {
                        partition name (string): {
                            name (string): partition name
                            major (string): major number,
                            minor (string): minor number,
                            size (long): partition size,
                            totalsize (long): drive total size,
                            percent (int): partition size over drive total size,
                            readonly (bool): True if partition is readonly,
                            mountpoint (string): mountpoint name,
                            partition (string): ,
                            removable (bool): True if partition is removable (external disk/usb stick...)
                            drivemodel (string): drive model,
                        },
                        ...
                    },
                }

        """
        # check if refresh is needed
        if self.timestamp is not None and time.time()-self.timestamp<=self.CACHE_DURATION:
            self.logger.trace('Use cached data')
            return

        res = self.command(u'/bin/lsblk --list --bytes --output NAME,MAJ:MIN,TYPE,RM,SIZE,RO,MOUNTPOINT,RA,MODEL')
        devices = {}
        if not res[u'error'] and not res[u'killed']:
            self.partitions = []

            # parse data
            matches = re.finditer(r'^(.*?)\s+(\d+):(\d+)\s+(.*?)\s+(\d)\s+(.*?)\s+(\d)\s+(.*?)\s+(\d+)(\s|.*?)$', u'\n'.join(res[u'stdout']), re.UNICODE | re.MULTILINE)
            for _, match in enumerate(matches):
                groups = match.groups()
                if len(groups)==10:
                    # name
                    name = groups[0]
                    
                    # drive properties
                    partition = True
                    model = None
                    if groups[3].find('disk')!=-1:
                        current_drive = name
                        model = groups[9]
                        partition = False
                        total_size = groups[5]
                        try:
                            total_size = int(total_size)
                        except: # pragma: no cover
                            pass

                    # readonly flag
                    readonly = True
                    if groups[6]=='0':
                        readonly = False

                    # removable flag
                    removable = True
                    if groups[4]=='0':
                        removable = False

                    # mountpoint
                    mountpoint = groups[7]

                    # size and percent
                    size = groups[5]
                    percent = None
                    try:
                        size = int(size)
                        percent = int(float(size)/float(total_size)*100.0)
                    except: # pragma: no cover
                        pass

                    # fill device
                    device = {
                        'name': name,
                        'major': groups[1],
                        'minor': groups[2],
                        'size': size,
                        'totalsize': total_size,
                        'percent': percent,
                        'readonly': readonly,
                        'mountpoint': mountpoint,
                        'partition': partition,
                        'removable': removable,
                        'drivemodel': model
                    }

                    # save device
                    if current_drive not in devices:
                        devices[current_drive] = {}
                    devices[current_drive][name] = device

                    # partition
                    if partition:
                        self.partitions.append(name)

        # save devices
        self.devices = devices

        # update timestamp
        self.timestamp = time.time()

    def get_devices_infos(self):
        """
        Returns all devices ordered by drive/partition

        Returns:
            dict: dict of devices
        """
        self.__refresh()

        return self.devices

    def get_drives(self):
        """
        Returns drives infos only

        Returns:
            dict: dict of drives
        """
        self.__refresh()

        drives = {}
        for drive in self.devices:
            for device in self.devices[drive]:
                if not self.devices[drive][device]['partition']:
                    # it's a drive
                    drives[drive] = self.devices[drive][device]
                
        return drives

    def get_partitions(self):
        """
        Returns partitions infos only

        Returns:
            dict: dict of partitions
        """
        self.__refresh()

        partitions = {}
        for drive in self.devices:
            for device in self.devices[drive]:
                if self.devices[drive][device]['partition']:
                    # it's a partition
                    partitions[device] = self.devices[drive][device]
                
        return partitions

    def get_device_infos(self, device):
        """
        Returns device infos according to device name (sda, sdb1...)

        Args:
            device (string): existing device name

        Returns:
            dict: dict of device infos or None if device not found
        """
        self.__refresh()

        for drive in self.devices.keys():
            if device in self.devices[drive]:
                return self.devices[drive][device]

        return None
