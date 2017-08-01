#!/usr/bin/env python
# -*- coding: utf-8 -*

import logging
from threading import Thread
from libs.console import EndlessConsole
from libs.lsblk import Lsblk
from libs.udevadm import Udevadm

class FlashDrive():
    """
    Flash drive helper
    """

    def __init__(self):
        #Thread.__init__(self)
        #Thread.daemon = True

        #members
        self.logger = logging.getLogger(self.__class__.__name__)
        #self.logger.setLevel(logging.DEBUG)
        self.lsblk = Lsblk()
        self.udevadm = Udevadm()
        self.console = None
        self.percent = 0

    def get_percent(self):
        """
        Return current flash process percent

        Return:
            int: flash process percent
        """
        return self.percent

    def get_flashable_drives(self):
        """
        Return all flashable drives plugged on computer

        Returns:
            list: drives paths
        """
        #get system drives
        drives = self.lsblk.get_drives()
        self.logger.debug('drives=%s' % drives)

        #get drives types
        flashables = []
        for drive in drives:
            device_type = self.udevadm.get_device_type('/dev/%s' % drive)
            if device_type in (self.udevadm.TYPE_USB, self.udevadm.TYPE_SDCARD):
                #get readble model
                model = drives[drive]['drivemodel']
                if model is None or len(model)==0:
                    if device_type==self.udevadm.TYPE_USB:
                        model = 'No model USB'
                    if device_type==self.udevadm.TYPE_SDCARD:
                        model = 'No model SD Card'

                #save entry
                flashables.append({
                    'model': model,
                    'path': '/dev/%s' % drive
                })

        return flashables

    def __flash_callback(self, stdout, stderr):
        """
        Flash process callback

        Args:
            stdout (string): stdout message
            stderr (string): stderr message
        """
        self.logger.info('stdout=%s' % stdout)

    def __flash_end_callback(self):
        """
        Flash process ended callback
        """
        self.logger.info('Flash over')
        self.percent = 0
        self.console = None

    def flash_drive(self, drive, iso):
        """
        Flash drive

        Args:
            drive (string): drive to flash
            iso (string): path to iso
        """
        if self.console is not None:
            raise Exception(u'Flash is already running')

        self.console = EndlessConsole('command', self.__flash_callback, self__flash_end_callback)
        self.console.start()

    def stop_flash(self):
        """
        Stop flash process
        """
        if self.console is None:
            #no flash process is running
            return False

        self.console.kill()

