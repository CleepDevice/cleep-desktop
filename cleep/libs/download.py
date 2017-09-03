#!/usr/bin/env python
# -*- coding: utf-8 -*

import logging
import urllib3
import uuid
import time
import os
import hashlib
import platform
import tempfile

class Download():
    """
    Download file helper
    http://downloads.raspberrypi.org/raspbian/images/
    """

    TMP_FILE_PREFIX = 'cleep_download'

    STATUS_IDLE = 0
    STATUS_DOWNLOADING = 1
    STATUS_DOWNLOADING_NOSIZE = 2
    STATUS_ERROR = 3
    STATUS_ERROR_INVALIDSIZE = 4
    STATUS_ERROR_BADCHECKSUM = 5
    STATUS_DONE = 6

    def __init__(self, status_callback):
        #logger
        self.logger = logging.getLogger(self.__class__.__name__)
        self.logger.setLevel(logging.DEBUG)

        #members
        self.temp_dir = tempfile.gettempdir()
        self.download = None
        self.__cancel = False
        self.status_callback = status_callback
        self.http = urllib3.PoolManager(num_pools=1)

        #purge previously downloaded files
        self.purge_files()

    def cancel(self):
        """
        Cancel current download
        """
        self.__cancel = True

    def purge_files(self):
        """
        Remove all files that stay from previous processes
        """
        for root, dirs, dls in os.walk(self.temp_dir):
            for dl in dls:
                if os.path.basename(dl).startswith(self.TMP_FILE_PREFIX):
                    self.logger.debug('Purge existing downloaded file: %s' % dl)
                    try:
                        os.remove(os.path.join(self.temp_dir, dl))
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

    def generate_sha256(self, file_path):
        """
        Generate SHA256 checksum for specified file

        Args:
            file_path (string): file path
        """
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            while True:
                buf = f.read(1024)
                if not buf:
                    break
                sha256.update(buf)

        return sha256.hexdigest()

    def generate_md5(self, file_path):
        """
        Generate MD5 checksum for specified file

        Args:
            file_path (string): file path
        """
        md5 = hashlib.md5()
        with open(file_path, 'rb') as f:
            while True:
                buf = f.read(1024)
                if not buf:
                    break
                sha1.update(buf)

        return md5.hexdigest()

    def download_from_url(self, url, check_sha1=None, check_sha256=None, check_md5=None):
        """
        Download specified url. Specify key to check if necessary.

        Args:
            url (string): url to download
            check_sha1 (string): sha1 key to check
            check_sha256 (string): sha256 key to check
            check_md5 (string): md5 key to check

        Returns:
            string: downloaded filepath (temp filename, it will be deleted during next download)
        """
        #prepare iso
        self.download = os.path.join(self.temp_dir, '%s_%s' % (self.TMP_FILE_PREFIX, str(uuid.uuid4())))
        self.logger.debug('File will be saved to "%s"' % self.download)
        download = None
        try:
            download = open(self.download, u'wb')
        except:
            self.logger.exception('Unable to create file:')
            self.status = self.STATUS_ERROR
            self.status_callback(self.status, 0, 0)
            return None

        #initialize download
        try:
            resp = self.http.request('GET', url, preload_content=False)
        except:
            self.logger.exception('Error initializing http request:')
            self.status = self.STATUS_ERROR
            self.status_callback(self.status, 0, 0)
            return None

        #get file size
        file_size = 0
        try:
            file_size = int(resp.getheader('Content-Length'))
            self.status = self.STATUS_DOWNLOADING
        except:
            self.logger.exception('Error getting content-length value from header:')
        self.status_callback(self.status, 0, 0)
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
                download.write(buf)
            except:
                self.logger.exception('Unable to write to download file "%s":' % self.download)
                self.status = self.STATUS_ERROR
                self.status_callback(self.status, file_size, self.percent)
                download.close()
                return None
            
            #compute percentage
            if file_size!=0:
                self.percent = int(float(downloaded_size) / float(file_size) * 100.0)
                self.status_callback(self.status, file_size, self.percent)
                if not self.percent%5 and last_percent!=self.percent:
                    last_percent = self.percent
                    self.logger.debug('Downloading %s %d%%' % (self.download, self.percent))

            #cancel download
            if self.__cancel:
                download.close()
                self.logger.debug('Flash process canceled during download')
                return None

        #download over
        download.close()

        #file size
        if downloaded_size==file_size:
            self.logger.debug('File size is valid')
        else:
            self.logger.error('Invalid downloaded size %d instead of %d' % (downloaded_size, file_size))
            self.status = self.STATUS_ERROR_INVALIDSIZE
            self.status_callback(self.status, file_size, self.percent)
            return None

        #checksum
        checksum_computed = None
        checksum_provided = None
        if check_sha1:
            checksum_computed = self.generate_sha1(self.download)
            checksum_provided = check_sha1
            self.logger.debug('SHA1 for %s: %s' % (self.download, checksum_computed))
        elif check_sha256:
            checksum_computed = self.generate_sha256(self.download)
            checksum_provided = check_sha256
            self.logger.debug('SHA256 for %s: %s' % (self.download, checksum_computed))
        elif check_md5:
            checksum_computed = self.generate_md5(self.download)
            checksum_provided = check_md5
            self.logger.debug('MD5 for %s: %s' % (self.download, checksum_computed))
        if checksum_provided is not None:
            if checksum_computed==checksum_provided:
                self.logger.debug('Checksum is valid')
            else:
                self.logger.error('Checksum from downloaded file is invalid (computed=%s provided=%s)' % (checksum_computed, checksum_provided))
                self.status = self.STATUS_ERROR_BADCHECKSUM
                self.status_callback(self.status, file_size, self.percent)
                return None
        else:
            self.logger.debug('No checksum to verify :(')

        #last status callback
        self.status = self.STATUS_DONE
        self.status_callback(self.status, file_size, 100)

        return self.download

last_percent = 0
def cb(status, size, percent):
    global last_percent
    if not percent%5 and last_percent!=percent:
        print(status, size, percent)
        last_percent = percent

#logging.basicConfig(level=logging.DEBUG, format='%(asctime)s %(name)s.%(funcName)s +%(lineno)s: %(levelname)-8s [%(process)d] %(message)s')
#d = Download(cb)
#d.purge_files()
#d.download_url('https://downloads.raspberrypi.org/raspbian_lite_latest', check_sha256='52e68130c152895905abe66279dd9feaa68091ba55619f5b900f2ebed381427b')
    
