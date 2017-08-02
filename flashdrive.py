#!/usr/bin/env python
# -*- coding: utf-8 -*

import logging
from threading import Thread
from libs.console import EndlessConsole
from libs.lsblk import Lsblk
from libs.udevadm import Udevadm
import urllib3
import uuid
import time
import os

class FlashDrive(Thread):
    """
    Flash drive helper
    """

    STATUS_IDLE = 0
    STATUS_DOWNLOADING = 1
    STATUS_DOWNLOADING_NOSIZE = 2
    STATUS_FLASHING = 3
    STATUS_DONE = 4
    STATUS_CANCELED = 5
    STATUS_ERROR = 6
    STATUS_ERROR_INVALIDSIZE = 7
    STATUS_ERROR_BADMD5SUM = 8

    def __init__(self):
        Thread.__init__(self)
        Thread.daemon = True

        #members
        self.logger = logging.getLogger(self.__class__.__name__)
        #self.logger.setLevel(logging.DEBUG)
        self.lsblk = Lsblk()
        self.udevadm = Udevadm()
        self.console = None
        self.percent = 0
        self.total_percent = 0
        self.status = self.STATUS_IDLE
        self.drive = None
        self.iso = None
        self.uri = None
        self.http = urllib3.PoolManager(num_pools=1)
        self.running = True
        self.cancel = False

    def stop(self):
        """
        Stop flash. Called before stopping application
        """
        self.cancel = True
        self.running = False

    def run(self):
        """
        Start flash process. Does nothing until start_flash is called
        """
        self.running = True

        while self.running:
            #check if process requested
            if self.uri and self.drive:
                self.logger.info('Flash process started')

                if self.__download_file():
                    #file downloaded successfully
                    #if self.__flash_drive():
                    #    #flash successful
                    #    self.status = self.STATUS_DONE
                    #elif self.cancel:
                    #    self.status = self.STATUS_CANCELED
                    self.status = self.STATUS_DONE
                elif self.cancel:
                    self.status = self.STATUS_CANCELED

                #reset everything
                if self.iso and os.path.exists(self.iso):
                    os.remove(self.iso)
                    self.logger.debug('File %s deleted' % self.iso)
                    self.iso = None
                self.drive = None
                self.cancel = False
                self.logger.info('Flash process terminated')

            else:
                #no process, pause thread
                time.sleep(.250)

    def start_flash(self, uri, drive):
        """
        Set flash data before launching process
        """
        if uri is None or len(uri)==0:
            raise Exception('Invalid Uri "%s"' % uri)
        if drive is None or len(drive)==0:
            raise Exception('Invalid drive "%s"' % uri)

        self.logger.debug('Start flash: %s %s' % (uri, drive))
        self.uri = uri
        self.drive = drive

    def cancel_flash(self):
        """
        Cancel current process
        """
        self.cancel = True

    def get_status(self):
        """
        Return current flash process percent

        Return:
            int: flash process percent
        """
        return {
            'percent': self.percent,
            'total_percent': self.total_percent,
            'status': self.status
        }

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

    def __download_file(self):
        """
        Download file
        """
        if self.uri is None or self.drive is None:
            self.logger.debug('No drive or uri specified, flash process stopped')
            return False

        #prepare iso
        self.iso = '/tmp/cleep_iso_%s' % str(uuid.uuid4())
        self.logger.debug('Iso file will be saved to "%s"' % self.iso)
        iso = None
        try:
            iso = open(self.iso, u'wb')
        except:
            self.logger.exception('Unable to create iso file:')
            self.status = self.STATUS_ERROR
            return False

        #initialize download
        try:
            resp = self.http.request('GET', self.uri, preload_content=False)
        except:
            self.logger.exception('Error initializing http request:')
            self.status = self.STATUS_ERROR
            return False

        #get file size
        file_size = 0
        try:
            file_size = int(resp.getheader('Content-Length'))
            self.status = self.STATUS_DOWNLOADING
        except:
            self.logger.exception('Error getting content-length value from header:')
            self.status = self.STATUS_DOWNLOADING_NOSIZE
        self.logger.debug('Size to download: %d bytes' % file_size)

        #download file
        downloaded_size = 0
        last_percent = -1
        while True:
            #read data
            buf = resp.read(1024)
            if not buf:
                #download ended or failed, stop statement
                break

            #save date to output file
            downloaded_size += len(buf)
            try:
                iso.write(buf)
            except:
                self.logger.exception('Unable to write to iso file "%s":' % self.iso)
                self.status = self.STATUS_ERROR
                iso.close()
                return False
            
            #compute percentage
            if file_size!=0:
                self.percent = int(float(downloaded_size) / float(file_size) * 100.0)
                self.total_percent = int(self.percent / 2)
                if not self.percent%5 and last_percent!=self.percent:
                    last_percent = self.percent
                    self.logger.debug('Downloading %s %d%%' % (self.iso, self.percent))

            #cancel download
            if self.cancel:
                iso.close()
                self.logger.debug('Flash process canceled during download')
                return False

        #download over, check file
        iso.close()
        #TODO md5sum
        if downloaded_size==file_size:
            self.logger.debug('File size is valid')
        else:
            self.logger.error('Invalid downloaded size %d instead of %d' % (downloaded_size, file_size))
            self.status = self.STATUS_ERROR_INVALIDSIZE
            return False

        return True

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
        self.status = self.STATUS_DONE
        self.percent = 0
        self.total_percent = 0
        self.console = None

    def __flash_drive(self):
        """
        Flash drive
        """
        if self.console is not None:
            raise Exception(u'Flashing operation is already running')

        self.status = self.STATUS_FLASHING
        self.console = EndlessConsole('command', self.__flash_callback, self__flash_end_callback)
        self.console.start()

    #def stop_flash(self):
    #    """
    #    Stop flash process
    #    """
    #    if self.console is None:
    #        #no flash process is running
    #        return False
    #
    #    self.console.kill()

