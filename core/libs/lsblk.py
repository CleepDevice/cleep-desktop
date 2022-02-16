#!/usr/bin/env python
# -*- coding: utf-8 -*-

from console import Console
import re
import time
import logging


class Lsblk(Console):
    """
    Lsblk helper
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
                    disk name (string): {
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
        if (
            self.timestamp is not None
            and time.time() - self.timestamp <= self.CACHE_DURATION
        ):
            self.logger.trace("Use cached data")
            return

        res = self.command(
            "/bin/lsblk --list --bytes --output NAME,MAJ:MIN,TYPE,RM,SIZE,RO,MOUNTPOINT,RA,MODEL"
        )
        devices = {}
        if not res["error"] and not res["killed"]:
            self.partitions = []

            # parse data
            stdout = "--\n".join(res["stdout"])
            matches = re.finditer(
                r"(.*?)\s+(\d+):(\d+)\s+(.*?)\s+(\d+)\s+(\d+)\s+(\d)\s(\s+|.*?)\s(\d+)\s*(.*?)--\n",
                stdout,
                re.UNICODE | re.MULTILINE,
            )
            total_size = 0
            for _, match in enumerate(matches):
                groups = match.groups()
                if len(groups) == 10:
                    if groups[3] in ("loop", "rom") or groups[0].startswith("loop"):
                        continue

                    device = {
                        "name": groups[0],
                        "major": groups[1],
                        "minor": groups[2],
                        "size": self.__parse_int(groups[5]),
                        "totalsize": total_size,
                        "percent": None,
                        "readonly": groups[6] != "0",
                        "mountpoint": groups[7].strip() or None,
                        "partition": True,
                        "removable": groups[4] != "0",
                        "model": groups[9].strip() or None,
                    }

                    # compute some values
                    if groups[3] == "disk":
                        current_disk = device["name"]
                        device["partition"] = False
                        total_size = self.__parse_int(groups[5])
                        device["totalsize"] = total_size
                    device["percent"] = (
                        int(float(device["size"]) / float(device["totalsize"]) * 100.0)
                        if device["totalsize"] != 0
                        else 0
                    )

                    # save device
                    if current_disk not in devices:
                        devices[current_disk] = {}
                    devices[current_disk][device["name"]] = device

                    # partition
                    if device["partition"]:
                        self.partitions.append(device["name"])

        # save devices
        self.devices = devices

        # update timestamp
        self.timestamp = time.time()

    def __parse_int(self, string):
        """
        Parse string to int

        Args:
            string (str): string to parse

        Returns:
            int: parsed string or 0 if problem occured
        """
        try:
            return int(string)
        except:
            return 0

    def get_devices_infos(self):
        """
        Returns all devices ordered by drive/partition

        Returns:
            dict: dict of devices
        """
        self.__refresh()

        return self.devices

    def get_disks(self):
        """
        Returns disks infos only

        Returns:
            dict: dict of drives
        """
        self.__refresh()

        drives = {}
        for drive in self.devices:
            for device in self.devices[drive]:
                if not self.devices[drive][device]["partition"]:
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
                if self.devices[drive][device]["partition"]:
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
