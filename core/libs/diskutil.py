#!/usr/bin/env python
# -*- coding: utf-8 -*-

try:
    from console import Console
except:
    from core.libs.console import Console
import re
import time
import logging

class Diskutil():
    """
    Mac diskutil class helper
    This code is ported from etcher-cli bash script to python class and can be found in etcher-cli project (Copyright balena.io)
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

    def __device_infos(self, device):
        """
        Get device infos

        Args:
           device (string): device string

        Returns:
        
        """
        infos = {
            'description': None,
            'volumename': None,
            'removable': None,
            'protected': None,
            'location': None,
            'totalsize': None
        }

        res = self.console.command('/usr/sbin/diskutil info "%s"' % device)
        if not res['error'] and not res['killed']:
            # parse data
            matches = re.finditer(
                r'^\s+(Device / Media Name:\s+(.*?))$|^\s+(Volume Name:\s+(.*?))$|^\s+(Removable Media:\s+(.*?))$|^\s+(Read-Only Media:\s+(.*?))$|^\s+(Device Location:\s+(.*?))$|^\s+(Total Size:\s+.*?\s.*?\s\((\d+)\sBytes\).*?)$',
                '\n'.join(res['stdout']),
                re.UNICODE | re.MULTILINE
            )
            for _, match in enumerate(matches):
                groups = match.groups()
                groups = list(filter(None, groups))
                if len(groups)==2:
                    if groups[0].startswith('Device / Media Name:'):
                        infos['description'] = groups[1].strip()
                    elif groups[0].startswith('Volume Name:'):
                        infos['volumename'] = groups[1].strip()
                    elif groups[0].startswith('Removable Media:'):
                        removable = groups[1].strip().lower()
                        if removable=='yes' or removable=='removable':
                            infos['removable'] = True
                        else:
                            infos['removable'] = False
                    elif groups[0].startswith('Read-Only Media:'):
                        protected = groups[1].strip().lower()
                        if protected=='yes':
                            infos['protected'] = True
                        else:
                            infos['protected'] = False
                    elif groups[0].startswith('Device Location:'):
                        infos['location'] = groups[1].strip()
                    elif groups[0].startswith('Total Size:'):
                        try:
                            infos['totalsize'] = int(groups[1])
                        except:
                            infos['totalsize'] = 0

        return infos

    def __refresh(self):
        """
        Refresh all data
        """
        # check if refresh is needed
        if self.timestamp is not None and time.time()-self.timestamp<=self.CACHE_DURATION:
            self.logger.debug('Don\'t refresh')
            return

        res = self.console.command('/usr/sbin/diskutil list | /usr/bin/grep \'^\\/\' | /usr/bin/awk \'match($0, "\\\\(|$"){ print substr($0, 0, RSTART - 1) }\'')
        devices = {}
        if not res['error'] and not res['killed']:
            # parse data
            matches = re.finditer(r'^(/dev/.*?)$', '\n'.join(res['stdout']), re.UNICODE | re.MULTILINE)
            for _, match in enumerate(matches):
                groups = match.groups()
                if len(groups)==1:
                    drive = groups[0]
                    infos = self.__device_infos(drive)

                    # drop dmg image
                    if infos['description'].find('Disk Image')!=-1:
                        continue

                    # fix device name
                    name = infos['description']
                    if infos['volumename'].lower().find('not applicable')==-1:
                        name = '%s - %s' % (infos['volumename'], name)

                    # is drive system one?
                    system = False
                    if drive=='/dev/disk0' or (infos['location'].lower().find('internal')!=-1 and not infos['removable']):
                        system = True

                    # TODO add mountpoints parsing result of command "mount"
                    
                    # fill device
                    device = {
                        'device': drive,
                        'raw': drive.replace('/disk', '/rdisk'),
                        'name': name,
                        'totalsize': infos['totalsize'],
                        'protected': infos['protected'],
                        'removable': infos['removable'],
                        'system': system
                    }

                    # save drive
                    devices[drive] = device

        # save devices
        self.devices = devices

        # update timestamp
        self.timestamp = time.time()

    def get_devices_infos(self):
        """
        Return all devices ordered by drive

        Return:
            dict: dict of devices
        """
        self.__refresh()

        return self.devices

    def get_drives(self):
        """
        Return drives infos only

        Return:
            dict: dict of drives
        """
        self.__refresh()

        return self.devices.keys()

    def get_device_infos(self, device):
        """
        Return device infos according to device name (sda, sdb1...)

        Args:
            device (string): existing device name

        Return:
            dict: dict of device infos or None if device not found
        """
        self.__refresh()

        if device in self.devices.keys():
            return self.devices[device]

        return None

if __name__ == '__main__':
    du = Diskutil()
    drives = du.get_devices_infos()
    print(drives)

