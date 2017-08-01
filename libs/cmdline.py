#!/usr/bin/env python
# -*- coding: utf-8 -*-

from console import Console
from blkid import Blkid
from lsblk import Lsblk
import re
import time

class Cmdline():

    CACHE_DURATION = 3600.0

    def __init__(self):
        self.console = Console()
        self.blkid = Blkid()
        self.lsblk = Lsblk()
        self.timestamp = None
        self.root_device = None

    def __refresh(self):
        """
        Refresh data
        """
        #check if refresh is needed
        if self.timestamp is not None and time.time()-self.timestamp<=self.CACHE_DURATION:
            return

        res = self.console.command(u'/bin/cat /proc/cmdline')
        if not res[u'error'] and not res[u'killed']:
            #parse data
            matches = re.finditer(r'root=(.*?)\s', u'\n'.join(res[u'stdout']), re.UNICODE | re.MULTILINE)
            for matchNum, match in enumerate(matches):
                groups = match.groups()
                if len(groups)==1:
                    if groups[0].startswith(u'UUID='):
                        #get device from uuid
                        uuid = groups[0].replace(u'UUID=', u'')
                        root_device = self.blkid.get_device_by_uuid(uuid)
                    else:
                        #get device from path
                        root_device = groups[0]

                    #get file system infos
                    drives = self.lsblk.get_drives()

                    #save data
                    self.root_partition = root_device.replace(u'/dev/', u'')
                    self.root_drive = None
                    for drive in drives:
                        if self.root_partition.find(drive)!=-1:
                            self.root_drive = drive
                            break

        self.timestamp = time.time()

    def get_root_drive(self):
        """
        Return root drive

        Return:
            string: root drive
        """
        self.__refresh()
        return self.root_drive

    def get_root_partition(self):
        """
        Return root partition

        Return:
            string: root partition
        """
        self.__refresh()
        return self.root_partition

