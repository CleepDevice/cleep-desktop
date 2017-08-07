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
import hashlib
import platform
import re

class FlashDrive(Thread):
    """
    Flash drive helper
    """

    CACHE_DURATION = 3600.0

    TMP_FILE_PREFIX = 'cleep_iso'

    STATUS_IDLE = 0
    STATUS_DOWNLOADING = 1
    STATUS_DOWNLOADING_NOSIZE = 2
    STATUS_FLASHING = 3
    STATUS_VALIDATING = 4
    STATUS_DONE = 5
    STATUS_CANCELED = 6
    STATUS_ERROR = 7
    STATUS_ERROR_INVALIDSIZE = 8
    STATUS_ERROR_BADMD5SUM = 9

    ETCHER_LINUX = '/etc/cleep/etcher-cli/etcher-cli.linux %s %s'
    ETCHER_WINDOWS = 'TODO'
    ETCHER_MAC = 'TODO'

    def __init__(self):
        Thread.__init__(self)
        Thread.daemon = True

        #logger
        self.logger = logging.getLogger(self.__class__.__name__)
        #self.logger.setLevel(logging.DEBUG)

        #get etcher command
        if platform.system()=='Windows':
            self.etcher_cmd = self.ETCHER_WINDOWS
        elif platform.system()=='Linux':
            self.etcher_cmd = self.ETCHER_LINUX
        elif platform.system()=='Darwin':
            self.etcher_cmd = self.ETCHER_MAC
        self.logger.debug('Etcher command line: %s' % self.etcher_cmd)

        #members
        self.lsblk = Lsblk()
        self.udevadm = Udevadm()
        self.console = None
        self.percent = 0
        self.total_percent = 0
        self.eta = 0
        self.status = self.STATUS_IDLE
        self.drive = None
        self.iso = None
        self.iso_sha1 = None
        self.isos = []
        self.uri = None
        self.http = urllib3.PoolManager(num_pools=1)
        self.running = True
        self.cancel = False
        self.timestamp_isos = None
        self.__etcher_output_pattern = r'.*(Flashing|Validating)\s\[.*\]\s(\d+)%\seta\s(.*)'
        self.__etcher_output_error = False

        #sanity clean
        self.purge_files()

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
                    #file downloaded successfully, launch flash+validation
                    self.__flash_drive()
                    while self.console is not None:
                        if self.cancel:
                            break
                        time.sleep(0.25)

                    #end of flash+validation
                    if self.cancel:
                        self.console.kill()
                        self.status = self.STATUS_CANCELED
                    else:
                        self.status = self.STATUS_DONE

                elif self.cancel:
                    self.status = self.STATUS_CANCELED
                else:
                    self.status = self.STATUS_ERROR

                #reset everything
                self.total_percent = 100
                if self.iso and os.path.exists(self.iso):
                    os.remove(self.iso)
                    self.logger.debug('File %s deleted' % self.iso)
                    self.iso = None
                self.drive = None
                self.uri = None
                self.cancel = False
                self.console = None
                self.logger.info('Flash process terminated')

            else:
                #no process, pause thread
                time.sleep(.250)

    def purge_files(self):
        """
        Remove all files that stay from previous processes
        """
        for root, dirs, cleeps in os.walk('/tmp'):
            for cleep in cleeps:
                if os.path.basename(cleep).startswith(self.TMP_FILE_PREFIX):
                    self.logger.debug('Purge existing iso file: %s' % cleep)
                    try:
                        os.remove(os.path.join('/tmp', cleep))
                    except:
                        pass

    def generate_sha1(self, file_path):
        """
        Generate SHA1 checksum for specified file

        Args:
            file_path (string): file path
        """
        sha1 = hashlib.sha1()
        with open(file_path, 'rb') as f:
            while True:
                buf = f.read(1024)
                if not buf:
                    break
                sha1.update(buf)

        return sha1.hexdigest()

    def start_flash(self, uri, drive, iso_raspbian):
        """
        Set flash data before launching process
        """
        if uri is None or len(uri)==0:
            raise Exception('Invalid Uri "%s"' % uri)
        if drive is None or len(drive)==0:
            raise Exception('Invalid drive "%s"' % uri)
        if self.uri is not None or self.drive is not None:
            raise Exception('Installation is already running')

        #get sha1
        isos = self.get_isos(iso_raspbian)
        for iso in isos['isos']:
            if iso['uri']==uri:
                self.logger.debug('Found sha1 "%s" for iso "%s"' % (iso['sha1'], uri))
                self.iso_sha1 = iso['sha1']

        #store data
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
            'status': self.status,
            'eta': self.eta
        }

    def get_flashable_drives(self):
        """
        Return all flashable drives plugged on computer

        Returns:
            list: drives paths
                [
                    {
                        model (string): drive model
                        path (string): drive path
                    },
                    ...
                ]
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

    def get_isos(self, iso_raspbian):
        """
        Get list of isos file available

        Args:
            iso_raspbian (bool): function will also return raspbian isos

        Return:
            dict:
                raspbian (bool): with raspbian iso,
                cleepIsos (int): number of returned Cleep isos
                raspbianIsos (int): number of returned Raspbian isos
                isos (list): list of isos available ordered by date
                    [
                        {
                            label (string): iso label,
                            uri (string): file uri,
                            timestamp (int): timestamp of isos,
                            category (string): entry category ('cleep' or 'raspbian')
                            sha1 (string): sha1 checksum
                        },
                        ...
                    ]
        """
        #return isos from cache
        refresh_isos = True
        if self.timestamp_isos is not None and time.time()-self.timestamp_isos<=self.CACHE_DURATION:
            #check if raspbian isos are requested
            need_refresh = False
            if not iso_raspbian:
                for iso in self.isos:
                    if iso['category']=='raspbian':
                        #need to refresh list
                        need_refresh = True
                        break
            else:
                need_refresh = True
                for iso in self.isos:
                    if iso['category']=='raspbian':
                        need_refresh = False
                        break

            if not need_refresh: 
                refresh_isos = False

        isos = []

        if refresh_isos:
            #TODO get Cleep isos: need to develop website first :S
            #also raspbian isos will be included in this request

            #get raspbian isos
            if iso_raspbian:
                isos.append({
                    'label': 'Raspbian Lite',
                    'uri': 'https://downloads.raspberrypi.org/raspbian_lite_latest',
                    'timestamp': 1499205600,
                    'category': 'raspbian',
                    'sha1': '30a171e10eb0b93b0e552837929c504d1bacd755'
                })
                isos.append({
                    'label': 'Raspbian Desktop',
                    'uri': 'https://downloads.raspberrypi.org/raspbian_latest',
                    'timestamp': 1499205600,
                    'category': 'raspbian',
                    'sha1': 'e1edd4d26090b3e67a66939fa77eeb656de8a2c5'
                })

            self.isos = sorted(isos, key=lambda i:i['timestamp'])
            self.timestamp_isos = time.time()

        else:
            self.logger.debug('Return isos list from cache')

        cleepIsos = 0
        raspbianIsos = 0
        for iso in self.isos:
            if iso['category']=='cleep':
                cleepIsos += 1
            elif iso['category']=='raspbian':
                raspbianIsos += 1

        return {
            'isos': self.isos,
            'cleepIsos': cleepIsos,
            'raspbianIsos': raspbianIsos,
            'raspbian': iso_raspbian
        }

    def __download_file(self):
        """
        Download file
        """
        if self.uri is None or self.drive is None:
            self.logger.debug('No drive or uri specified, flash process stopped')
            return False

        #prepare iso
        self.iso = '/tmp/%s_%s' % (self.TMP_FILE_PREFIX, str(uuid.uuid4()))
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
                self.total_percent = int(self.percent / 3)
                if not self.percent%5 and last_percent!=self.percent:
                    last_percent = self.percent
                    self.logger.debug('Downloading %s %d%%' % (self.iso, self.percent))

            #cancel download
            if self.cancel:
                iso.close()
                self.logger.debug('Flash process canceled during download')
                return False

        #download over
        iso.close()

        #file size
        if downloaded_size==file_size:
            self.logger.debug('File size is valid')
        else:
            self.logger.error('Invalid downloaded size %d instead of %d' % (downloaded_size, file_size))
            self.status = self.STATUS_ERROR_INVALIDSIZE
            return False

        #checksum
        if self.iso_sha1:
            sha1 = self.generate_sha1(self.iso)
            self.logger.debug('Sha1 for %s: %s' % (self.iso, sha1))
            if self.iso_sha1==sha1:
                self.logger.debug('Sha1 checksum is valid')
            else:
                self.logger.error('Sha1 from downloaded file is invalid (%s!=%s)' % (self.iso_sha1, sha1))
                self.status = self.STATUS_ERROR_BADCHECKSUM
                return False
        else:
            self.logger.debug('No checksum to verify :(')

        return True

    def __flash_callback(self, stdout, stderr):
        """
        Flash process callback

        Args:
            stdout (string): stdout message
            stderr (string): stderr message
        """
        #handle current flasing/validating status
        try:
            #self.logger.info('Flash stdout=%s' % stdout)
            matches = re.finditer(self.__etcher_output_pattern, stdout.decode('utf-8'), re.UNICODE | re.DOTALL)
            for matchNum, match in enumerate(matches):
                group = match.group().strip()
                if len(group)>0 and len(match.groups())>0:
                    items = match.groups()

                    #current operation percent
                    try:
                        self.percent = int(items[1])
                    except:
                        self.percent = 0

                    #status
                    if items[0]=='Flashing':
                        self.status = self.STATUS_FLASHING
                    elif items[0]=='Validating':
                        self.status = self.STATUS_VALIDATING
                    else:
                        self.status = self.STATUS_VALIDATING

                    #total percent
                    if self.status==self.STATUS_FLASHING:
                        self.total_percent = 33 + int(self.percent/3)
                    else:
                        self.total_percent = 66 + int(self.percent/3)

                    #eta
                    self.eta = items[2]
        except:
            if not self.__etcher_output_error:
                self.logger.exception('Exception occured during etcher status:')
                self.__etcher_output_error = True

    def __flash_end_callback(self):
        """
        Flash process ended callback
        """
        self.logger.info('Flash operation terminated')
        self.console = None
        self.__etcher_output_error = False

    def __flash_drive(self):
        """
        Flash drive
        """
        if self.console is not None:
            raise Exception(u'Flashing operation is already running')

        self.status = self.STATUS_FLASHING
        cmd = self.etcher_cmd % (self.drive, self.iso)
        self.logger.debug('Etcher command to execute: %s' % cmd)
        self.console = EndlessConsole(cmd, self.__flash_callback, self.__flash_end_callback)
        self.console.start()

