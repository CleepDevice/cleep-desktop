#!/usr/bin/env python
# -*- coding: utf-8 -*-

from core.libs.console import Console
from core.libs.blkid import Blkid
from core.libs.lsblk import Lsblk
import re
import time
import logging

class Udevadm(Console):
    """
    udevadm is used to determine device type. Device type can be ATA, USB or SDCARD
    """

    CACHE_DURATION = 10.0

    TYPE_UNKNOWN = 0
    TYPE_ATA = 1
    TYPE_USB = 2
    TYPE_SDCARD = 3
    TYPE_MMC = 4

    def __init__(self):
        """
        Constructor
        """
        Console.__init__(self)

        # members
        self.timestamps = {}
        self.devices = {}
        self.logger = logging.getLogger(self.__class__.__name__)

    def __refresh(self, device):
        """
        Refresh data filling devices class member

        Args:
            device (string): device name
        """
        # check if refresh is needed
        if device in self.timestamps and time.time()-self.timestamps[device]<=self.CACHE_DURATION:
            self.logger.trace('Use cached data')
            return

        # add new device entry if necessary
        if device not in self.devices:
            self.devices[device] = self.TYPE_UNKNOWN

        res = self.command(u'/bin/udevadm info --query=property --name="%s"' % device)
        if not res[u'error'] and not res[u'killed']:
            # parse data
            matches = re.finditer(r'^(?:(ID_DRIVE_FLASH_SD)=(\d)|(ID_DRIVE_MEDIA_FLASH_SD)=(\d)|(ID_BUS)=(.*?)|(ID_USB_DRIVER)=(.*?)|(ID_ATA)=(\d)|(ID_PATH_TAG)=(.*?))$', u'\n'.join(res[u'stdout']), re.UNICODE | re.MULTILINE)
            for _, match in enumerate(matches):
                # get values and filter None values
                groups = match.groups()
                groups = list(filter(None, groups))

                if len(groups)==2:
                    if groups[0]==u'ID_BUS' and groups[1]=='usb':
                        # usb stuff (usb stick, usb card reader...)
                        self.devices[device] = self.TYPE_USB
                        break
                    elif groups[0]==u'ID_DRIVE_FLASH_SD' and groups[1]=='1':
                        # sdcard
                        self.devices[device] = self.TYPE_SDCARD
                        break
                    elif groups[0]==u'ID_DRIVE_MEDIA_FLASH_SD' and groups[1]=='1':
                        # sdcard
                        self.devices[device] = self.TYPE_SDCARD
                        break
                    elif groups[0]==u'ID_BUS' and groups[1]=='ata':
                        # ata device (SATA, PATA)
                        self.devices[device] = self.TYPE_ATA
                        break
                    elif groups[0]==u'ID_ATA':
                        # ata device (SATA, PATA)
                        self.devices[device] = self.TYPE_ATA
                        break
                    elif groups[0]==u'ID_PATH_TAG' and groups[1].find('mmc')!=-1:
                        # mmc device
                        self.devices[device] = self.TYPE_MMC
                    else:
                        # unknown device type
                        self.devices[device] = self.TYPE_UNKNOWN

        self.timestamps[device] = time.time()

    def get_device_type(self, device):
        """
        Return specified device type

        Args:
            device (string): device name (for example mmcblk0)

        Returns:
            int: device type (ATA=1, USB=2, SDCARD=3, MMC=4, UNKNOWN=0, see class constants)
        """
        self.__refresh(device)
        return self.devices[device]
