#!/usr/bin/env python
# -*- coding: utf-8 -*-

from cleep.libs.console import Console
import re
import time
import logging

class Wmic():
    """
    Return list of drives on windows environment
    """

    CACHE_DURATION = 2.0

    def __init__(self):
        """
        Constructor
        """
        self.console = Console()
        self.logger = logging.getLogger(self.__class__.__name__)
        self.timestamp = None
        self.devices = {}

    def __refresh(self):
        """
        Refresh all data
        """
        #check if refresh is needed
        if self.timestamp is not None and time.time()-self.timestamp<=self.CACHE_DURATION:
            self.logger.debug('Don\'t refresh')
            return

        res = self.console.command(u'wmic logicaldisk get volumename,description,size,drivetype,caption,freespace')
        print(res)
        devices = {}
        if not res[u'error'] and not res[u'killed']:
        
            #parse data
            matches = re.finditer(r'^(.*?:)\s+(.*?)\s+(\d)\s+(\d+)\s+(\d+)\s+(.*?)$', u'\n'.join(res[u'stdout']), re.UNICODE | re.MULTILINE)
            for matchNum, match in enumerate(matches):
                groups = match.groups()
                print(groups)
                if len(groups)==6:
                    #fields
                    field_caption = groups[0]
                    field_description = groups[1]
                    field_drivetype = groups[2]
                    field_freespace = groups[3]
                    field_size = groups[4]
                    field_volumename = groups[5]
                    
                    #removable
                    removable = False
                    if field_drivetype in ('2'):
                        removable = True
                        
                    #size
                    size = 0
                    freespace = 0
                    percent = 0
                    remainspace = 0
                    try:
                        size = int(field_size)
                        freespace = int(field_freespace)
                        remainspace = size-freespace
                        percent = (remainspace / size) * 100
                    except Exception as e:
                        pass
                    
                    #fill device
                    device = {
                        u'name': field_volumename,
                        u'size': remainspace,
                        u'totalsize': size,
                        u'percent': percent,
                        u'mountpoint': field_caption,
                        u'removable': removable,
                        u'drivemodel': field_description
                    }

                    #save device
                    devices[field_caption] = device

        #save devices
        self.devices = devices

        #update timestamp
        self.timestamp = time.time()

    def get_drives(self):
        """
        Return drives infos only

        Return:
            dict: dict of drives
        """
        self.__refresh()

        return self.devices

    def get_drive_infos(self, drive):
        """
        Return drive infos according to drive name (c:, d:...)

        Args:
            drive (string): existing drive name

        Return:
            dict: dict of drive infos or None if drive not found
        """
        self.__refresh()

        if drive in self.devices.keys():
            return self.devices[drive]

        return None
