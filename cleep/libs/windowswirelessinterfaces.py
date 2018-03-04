#!/usr/bin/env python
# -*- coding: utf-8 -*-

from win32wifi import Win32Wifi

class WindowsWirelessInterfaces():
    """
    Return list of wireless interfaces
    """
    
    CACHE_DURATION = 2.0
    
    def __init__(self):
        """
        Constructor
        """
        pass

    def get_interfaces(self):
        """
        Return wireless interfaces

        Return:
            WirelessInterface: WirelessInterface instance (https://github.com/kedos/win32wifi/blob/master/win32wifi/Win32Wifi.py#L35)::
                {
                    Description (string)
                    GUID (string)
                    State (string)
                }
        """
        return Win32Wifi.getWirelessInterfaces()

