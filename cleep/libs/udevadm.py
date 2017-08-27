#!/usr/bin/env python
# -*- coding: utf-8 -*-
try:
    from console import Console
    from blkid import Blkid
    from lsblk import Lsblk
except:
    from cleep.libs.console import Console
    from cleep.libs.blkid import Blkid
    from cleep.libs.lsblk import Lsblk
import re
import time

class Udevadm():
    """
    udevadm is used to determine device type. Device type can be ATA, USB or SDCARD
    """

    CACHE_DURATION = 2.0

    TYPE_UNKNOWN = 0
    TYPE_ATA = 1
    TYPE_USB = 2
    TYPE_SDCARD = 3

    def __init__(self):
        """
        Constructor
        """
        self.console = Console()
        self.timestamps = {}
        self.devices = {}

    def __refresh(self, device):
        """
        Refresh data

        Args:
            device (string): device name
        """
        #check if refresh is needed
        if device in self.timestamps and time.time()-self.timestamps[device]<=self.CACHE_DURATION:
            return

        #add new device entry if necessary
        if device not in self.devices:
            self.devices[device] = self.TYPE_UNKNOWN

        res = self.console.command(u'/bin/udevadm info --query=property --name="%s"' % device)
        if not res[u'error'] and not res[u'killed']:
            #parse data
            matches = re.finditer(r'^(?:(ID_DRIVE_FLASH_SD)=(\d)|(ID_DRIVE_MEDIA_FLASH_SD)=(\d)|(ID_BUS)=(.*?)|(ID_USB_DRIVER)=(.*?)|(ID_ATA)=(\d))$', u'\n'.join(res[u'stdout']), re.UNICODE | re.MULTILINE)
            for matchNum, match in enumerate(matches):
                #get values and filter None values
                groups = match.groups()
                groups = list(filter(None, groups))

                if len(groups)==2:
                    if groups[0]==u'ID_BUS' and groups[1]=='usb':
                        #usb stuff (usb stick, usb card reader...)
                        self.devices[device] = self.TYPE_USB
                        break
                    elif groups[0]==u'ID_DRIVE_FLASH_SD' and groups[1]=='1':
                        #sdcard
                        self.devices[device] = self.TYPE_SDCARD
                        break
                    elif groups[0]==u'ID_DRIVE_MEDIA_FLASH_SD' and groups[1]=='1':
                        #sdcard
                        self.devices[device] = self.TYPE_SDCARD
                        break
                    elif groups[0]==u'ID_BUS' and groups[1]=='ata':
                        #ata device (SATA, PATA)
                        self.devices[device] = self.TYPE_ATA
                        break
                    elif groups[0]==u'ID_ATA':
                        #ata device (SATA, PATA)
                        self.devices[device] = self.TYPE_ATA
                        break
                    else:
                        #unknown device type
                        self.devices[device] = self.TYPE_UNKNOWN

        self.timestamps[device] = time.time()

    def get_device_type(self, device):
        """
        Return specified device type

        Args:
            device (string): device name

        Return:
            int: device type (ATA=1, USB=2, SDCARD=3, UNKNOWN=0, see class constants)
        """
        self.__refresh(device)
        return self.devices[device]

