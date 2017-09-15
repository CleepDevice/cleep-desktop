#!/usr/bin/env python
# -*- coding: utf-8 -*-

import win32file, win32api, win32com.client
import time
import logging

class WindowsDrives():
    """
    Return list of drives on Windows environment
    
    Inspired from https://stackoverflow.com/a/33797636
    
    Devices output list is similar to https://github.com/resin-io-modules/drivelist (except form deviceType) because 
    scripts for other environements are copied from drivelist project
    """
    
    CACHE_DURATION = 2.0
    
    #https://msdn.microsoft.com/fr-fr/library/windows/desktop/aa364939(v=vs.85).aspx
    DEVICE_TYPE_UNKNOWN = 0
    DEVICE_TYPE_NOROOTDIR = 1
    DEVICE_TYPE_REMOVABLE = 2
    DEVICE_TYPE_FIXED = 3
    DEVICE_TYPE_REMOTE = 4
    DEVICE_TYPE_CDROM = 5
    DEVICE_TYPE_RAMDISK = 6

    def __init__(self):
        """
        Constructor
        """
        self.logger = logging.getLogger(self.__class__.__name__)
        self.timestamp = None
        self.devices = {}
        client = win32com.client.Dispatch('WbemScripting.SWbemLocator')
        self.winService = client.ConnectServer('.', 'root\cimv2')
        
    def __get_system_drive(self):
        """
        Get system drive
        
        Return:
            string: system drive letter ("c:")
        """
        properties = self.winService.ExecQuery("Select * from Win32_OperatingSystem")
        system_drive = None
        for property in properties[0].Properties_:
            if property.Name=='SystemDrive':
                system_drive = property.Value
                break
                
        return system_drive

    def __refresh(self):
        """
        Refresh all data (fill self.devices)
        """
        #check if refresh is needed
        if self.timestamp is not None and time.time()-self.timestamp<=self.CACHE_DURATION:
            self.logger.debug('Don\'t refresh')
            return

        #get system drive
        system_drive = self.__get_system_drive()
        self.logger.debug('System drive: %s' % system_drive)
        
        #get infos from DiskDrive command and init devices
        devices = {}
        disks = self.winService.ExecQuery('SELECT * FROM Win32_DiskDrive')
        for disk in disks:
            current_device = {
                'device': None,
                'displayName': None,
                'description': None,
                'size': 0,
                'mountpoints': [],
                'raw': None,
                'protected': False,
                'system': None,
                'deviceType': None,
                'temp_partitions': [],
                'temp_displayname': []
            }
            
            for property in disk.Properties_:
                if property.Name=='DeviceID':
                    current_device['device'] = property.Value
                    current_device['raw'] = property.Value
                elif property.Name=='Caption':
                    current_device['description'] = property.Value
                elif property.Name=='Size':
                    try:
                        current_device['size'] = int(property.Value)
                    except:
                        current_device['size'] = 0
                self.logger.debug(property.Name, " = ", property.Value)
                
            devices[current_device['device']] = current_device
            
        #get infos from DiskDriveToDiskPartitions command
        partitions = self.winService.ExecQuery('SELECT * FROM Win32_DiskDriveToDiskPartition')
        for partition in partitions:
            for device in devices.keys():
                self.logger.debug('%s == %s' % (device, str(partition.Antecedent)))
                if device.replace('\\', '') in str(partition.Antecedent.replace('\\', '')):
                    self.logger.debug(partition.Dependent.split('=')[1])
                    devices[device]['temp_partitions'].append(partition.Dependent.split('=')[1].replace('"', ''))
                    
        #get infos from LogicalDiskToPartition
        logicals = self.winService.ExecQuery('SELECT * FROM Win32_LogicalDiskToPartition')
        for logical in logicals:
            for device in devices.keys():
                for partition in devices[device]['temp_partitions']:
                    self.logger.debug('%s == %s' % (partition, str(logical.Antecedent)))
                    if partition in str(logical.Antecedent):
                        mountpoint = logical.Dependent.split('=')[1].replace('"', '')
                        #save system
                        if mountpoint==system_drive:
                            devices[device]['system'] = True
                        else:
                            devices[device]['system'] = False
                        #save mountpoint
                        devices[device]['mountpoints'].append({
                            'path': mountpoint
                        })
                        #save displayName
                        devices[device]['temp_displayname'].append(mountpoint)
                        #save device type
                        if devices[device]['deviceType'] is None:
                            devices[device]['deviceType'] = win32file.GetDriveType(mountpoint)
                        #save protected
                        try:
                            #https://msdn.microsoft.com/en-us/library/windows/desktop/aa364993(v=vs.85).aspx
                            (_, _, _, readonly, _) = win32api.GetVolumeInformation('%s\\' % mountpoint)
                            if (int(readonly) & 0x00080000)==0:
                                devices[device]['protected'] = False
                            else:
                                devices[device]['protected'] = True
                        except Exception as e:
                            pass
            

        #clean dicts
        for device in devices.keys():
            devices[device]['temp_displayname'].sort()
            devices[device]['displayName'] = u', '.join(devices[device]['temp_displayname'])
            del devices[device]['temp_displayname']
            del devices[device]['temp_partitions']
       
        #save devices
        self.devices = list(devices.values())

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
        
        
        
if __name__ == '__main__':
    import pprint
    pp = pprint.PrettyPrinter(indent=2)
    
    d = WindowsDrives()
    devices = d.get_drives()
    pp.pprint(devices)