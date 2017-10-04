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
import base64

class Download():
    """
    Download file helper
    """

    TMP_FILE_PREFIX = 'cleep_tmp'
    DOWNLOAD_FILE_PREFIX = 'cleep_download'
    CACHED_FILE_PREFIX = 'cleep_cached'

    STATUS_IDLE = 0
    STATUS_DOWNLOADING = 1
    STATUS_DOWNLOADING_NOSIZE = 2
    STATUS_ERROR = 3
    STATUS_ERROR_INVALIDSIZE = 4
    STATUS_ERROR_BADCHECKSUM = 5
    STATUS_DONE = 6

    def __init__(self, status_callback=None):
        """
        Constructor

        Args:
            status_callback (function): status callback. Params: status, filesize, percent
        """
        #logger
        self.logger = logging.getLogger(self.__class__.__name__)
        #self.logger.setLevel(logging.DEBUG)

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

    def purge_files(self, force_all=False):
        """
        Remove all files that stay from previous processes

        Args:
            force_all (bool): force deletion of all files (cached ones too)
        """
        for root, dirs, dls in os.walk(self.temp_dir):
            for dl in dls:
                #delete temp files
                if os.path.basename(dl).startswith(self.DOWNLOAD_FILE_PREFIX):
                    self.logger.debug('Purge existing downloaded temp file: %s' % dl)
                    try:
                        os.remove(os.path.join(self.temp_dir, dl))
                    except:
                        pass

                #delete cached files
                elif force_all and os.path.basename(dl).startswith(self.CACHED_FILE_PREFIX):
                    self.logger.debug('Purge existing downloaded cached file: %s' % dl)
                    try:
                        os.remove(os.path.join(self.temp_dir, dl))
                    except:
                        pass

    def get_cached_files(self):
        """
        Return list of cached files

        Return:
            list: cached filepaths::
                [
                    {filename, filepath, filesize}
                    {filename, filepath, filesize}
                    ...
                ]
        """
        cached = []

        for root, dirs, dls in os.walk(self.temp_dir):
            for dl in dls:
                if os.path.basename(dl).startswith(self.CACHED_FILE_PREFIX):
                    filepath = os.path.join(self.temp_dir, dl)
                    filename = os.path.basename(dl).replace(self.CACHED_FILE_PREFIX, '')
                    filename = base64.b64decode(filename).decode('utf-8')
                    cached.append({
                        'filename': filename,
                        'filepath': filepath,
                        'filesize': os.path.getsize(filepath)
                    })

        return cached

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

    def __status_callback(self, status, size, percent):
        """
        Call status callback if configured

        Args:
            status (int): current download status
            size (int): downloaded filesize (bytes)
            percent (int): percentage of download
        """
        if self.status_callback:
            self.status_callback(status, size, percent)

    def download_from_url(self, url, check_sha1=None, check_sha256=None, check_md5=None, cache=None):
        """
        Download specified url. Specify key to check if necessary.
        This function is blocking

        Args:
            url (string): url to download
            check_sha1 (string): sha1 key to check
            check_sha256 (string): sha256 key to check
            check_md5 (string): md5 key to check
            cache (string): specify name to enable file caching (will not be purged automatically). None to disable caching

        Returns:
            string: downloaded filepath (temp filename, it will be deleted during next download) or None if error occured
        """
        #prepare filename
        download_uuid = str(uuid.uuid4())
        self.download = os.path.join(self.temp_dir, '%s_%s' % (self.TMP_FILE_PREFIX, download_uuid))
        self.logger.debug('File will be saved to "%s"' % self.download)
        download = None

        #check if file is cached
        if os.path.exists(self.download):
            #file cached, return it
            filesize = os.path.getsize(self.download)
            self.__status_callback(self.STATUS_DONE, filesize, 100)
            return self.download
        
        #prepare download
        try:
            download = open(self.download, u'wb')
        except:
            self.logger.exception('Unable to create file:')
            self.status = self.STATUS_ERROR
            self.__status_callback(self.status, 0, 0)
            return None

        #initialize download
        try:
            resp = self.http.request('GET', url, preload_content=False)
        except:
            self.logger.exception('Error initializing http request:')
            self.status = self.STATUS_ERROR
            self.__status_callback(self.status, 0, 0)
            return None

        #get file size
        file_size = 0
        try:
            file_size = int(resp.getheader('Content-Length'))
            self.status = self.STATUS_DOWNLOADING
        except:
            self.logger.exception('Error getting content-length value from header:')
        self.__status_callback(self.status, 0, 0)
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
                self.__status_callback(self.status, downloaded_size, self.percent)
                download.close()
                return None
            
            #compute percentage
            if file_size!=0:
                self.percent = int(float(downloaded_size) / float(file_size) * 100.0)
                self.__status_callback(self.status, downloaded_size, self.percent)
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
            self.__status_callback(self.status, downloaded_size, self.percent)
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
                self.__status_callback(self.status, file_size, self.percent)
                return None
        else:
            self.logger.debug('No checksum to verify :(')

        #last status callback
        self.status = self.STATUS_DONE
        self.__status_callback(self.status, file_size, 100)

        #rename file
        if not cache:
            download = os.path.join(self.temp_dir, '%s_%s' % (self.DOWNLOAD_FILE_PREFIX, download_uuid))
        else:
            hashname = base64.urlsafe_b64encode(cache.encode('utf-8')).decode('utf-8')
            download = os.path.join(self.temp_dir, '%s_%s' % (self.CACHED_FILE_PREFIX, hashname))
        try:
            os.rename(self.download, download)
            self.download = download
        except:
            pass

        return self.download

#last_percent = 0
#def cb(status, size, percent):
#    global last_percent
#    if not percent%5 and last_percent!=percent:
#        print(status, size, percent)
#        last_percent = percent
#
#logging.basicConfig(level=logging.DEBUG, format='%(asctime)s %(name)s.%(funcName)s +%(lineno)s: %(levelname)-8s [%(process)d] %(message)s')
#d = Download(cb)
#d.purge_files()
#d.download_url('https://downloads.raspberrypi.org/raspbian_lite_latest', check_sha256='52e68130c152895905abe66279dd9feaa68091ba55619f5b900f2ebed381427b')
    
