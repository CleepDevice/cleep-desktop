#!/usr/bin/env python
# -*- coding: utf-8 -*

import logging
from threading import Thread
import time
import os
import urllib3
import platform
import json
from download import Download
from libs.console import Console

class UpdateInfos():
    """
    Update structure
    """

    def __init__(self):
        self.update_available = False
        self.error = False
        self.filename = None
        self.url = None
        self.version = None
        self.size = 0

    def __str__(self):
        return 'UpdateInfos {update_available=%s error=%s filename=%s url=%s version=%s size=%d}' % (self.update_available, self.error, self.filename, self.url, self.version, self.size)


class Updates(Thread):
    """
    Updates manager: it can update etcher-cli and cleep-desktop files
    """

    ETCHER_RELEASES = 'https://api.github.com/repos/resin-io/etcher/releases'

    INSTALL_ETCHER_COMMAND_LINUX = '%s/scripts/install_etcher.linux %s %s'

    STATUS_IDLE = 0
    STATUS_DOWNLOADING_ETCHER = 1
    STATUS_DOWNLOADING_CLEEP = 2

    def __init__(self):
        Thread.__init__(self)
        Thread.daemon = True

        #logger
        self.logger = logging.getLogger(self.__class__.__name__)
        self.logger.setLevel(logging.DEBUG)

        #members
        self.http_headers =  {'user-agent':'Mozilla/5.0 (Windows NT 6.3; rv:36.0) Gecko/20100101 Firefox/36.0'}
        self.running = True
        self.http = urllib3.PoolManager(num_pools=1)
        self.__download_etcher = None
        self.__download_cleepdesktop = None
        self.__current_download = None
        self.status = self.STATUS_IDLE
        self.download_status = Download.STATUS_IDLE
        self.percent = 0
        self.cleep_path = os.getcwd()
        self.logger.debug('Cleep-desktop is installed in "%s"' % self.cleep_path)

    def stop(self):
        """
        Stop process
        """
        self.logger.debug('Stop update')
        self.cancel_download()
        self.running = False

    def cancel_download(self):
        """
        Cancel current download
        """
        self.logger.debug('Cancel download')
        #reset update flags
        self.__download_etcher = None
        self.__download_cleepdesktop = None

        #and cancel current download
        if self.__current_download:
            self.__current_download.cancel()

    def get_status(self):
        """
        Return current update status

        Returns:
            dict: current update status informations::
                {
                    status (int): current update status (see Updates.STATUS_*)
                    download (int): download status (see Download.STATUS_*)
                    percent (int): current download percentage
                }
        """
        return {
            'status': self.status,
            'download': self.download_status,
            'percent': self.percent
        }

    def __download_callback(self, status, size, percent):
        """
        Download callback

        Args:
            status (int): status from Download class
            size (int): current downloaded bytes
            percent (int): current progress
        """
        #save download status
        self.download_status = status
        self.percent = percent

    def run(self):
        """
        Start update process. Does nothing until check_updates is called and trigger update if necessary
        """
        self.running = True
        self.logger.debug('Updates thread started')

        #endless loop
        while self.running:

            if self.__download_etcher:
                self.logger.info('Downloading Etcher archive %s (%s)' % (self.__download_etcher.filename, self.__download_etcher.url))
                #new etcher update available
                self.__current_download = Download(self.__download_callback)
                #download it with no checksum (call is blocking)
                filepath = self.__current_download.download_from_url(self.__download_etcher.url)
                #end of dowload, trigger callback and reset member
                self.__current_download = None

                if filepath:
                    self.logger.debug('Etcher archive downloaded')
                    #process downloaded archive
                    if not self.__update_etcher(filepath):
                        self.logger.error('Etcher installation failed')
                    else:
                        self.logger.info('Etcher installation succeed (installed version is now %s)' % self.__download_etcher.version)
                else:
                    self.logger.error('Failed to download Etcher archive.')

                #end of etcher update process, reset variables
                self.__download_etcher = None

            if self.__download_cleepdesktop:
                #TODO new cleep-desktop update available
                pass

            time.sleep(1.0)

        self.logger.debug('Updates thread stopped')

    def __get_latest_etcher_release(self, releases):
        """
        Search for file to download for current user environment

        Args:
            releases (list): list of available files for a release

        Returns:
            tuple (string, string, int): release filename, release url (ready to download) and filesize (in bytes)
        """
        #get environment and architecture
        env = platform.system().lower()
        arch64 = platform.machine().endswith('64')
        pattern = None
        if env=='linux':
            pattern = 'linux-x86'
            if arch64:
                pattern = 'linux-x64'
        elif env=='darwin':
            pattern = 'darwin'
        elif env=='windows':
            pattern = 'win32-x86'
            if arch64:
                pattern = 'win32-x64'
        self.logger.debug('Search release using pattern: %s' % pattern)

        #search for release
        for release in releases:
            if 'browser_download_url' and 'size' and 'name' in release.keys():
                name = release['name'].lower()
                if name.find('etcher')>=0 and name.find('cli')>=0 and name.find(pattern)>=0:
                    #version found, return infos
                    self.logger.debug('Found release: %s' % release)
                    return release['name'], release['browser_download_url'], release['size']

        #nothing found
        return None, 0

    def __check_etcher_updates(self, etcher_version):
        """
        Check if etcher updates are available

        Returns:
            UpdateInfos: UpdateInfos instance
        """
        infos = UpdateInfos()

        try:
            resp = self.http.urlopen('GET', self.ETCHER_RELEASES, headers=self.http_headers)
            if resp.status==200:
                #response successful, parse data to get current latest version
                data = json.loads(resp.data.decode('utf-8'))

                #compare version (latest release is on top of the list)
                latest = data[0]
                #self.logger.debug('latest release: %s' % latest)
                if 'tag_name' not in latest.keys():
                    self.logger.error('No tag "tag_name" found in etcher response (maybe format has changed?). Unable to check latest etcher version.')
                    infos.error = True
                    return infos

                elif latest['tag_name']!=etcher_version:
                    #new version available, find cli version for current user platform
                    self.logger.debug('Update available (online version=%s installed version=%s)' % (latest['tag_name'], etcher_version))
                    infos.version = latest['tag_name']
                    infos.update_available = True
                    (infos.filename, infos.url, infos.size) = self.__get_latest_etcher_release(latest['assets'])

                else:
                    self.logger.debug('No etcher version available')

            else:
                self.logger.error('Unable to fetch etcher releases (status=%d)' % resp.status)
                self.logger.error('Etcher request data: %s' % resp.data)
                infos.error= True

        except:
            self.logger.exception('Unable to get etcher releases:')

        return infos

    def __check_cleepdesktop_updates(self):
        """
        Check if cleep-desktop updates are available
        """
        #TODO implement cleep-desktop updates as soon as website is available
        pass

    def check_updates(self, etcher_version, cleepdesktop_version):
        """
        Check updates available

        Args:
            etcher_version (string): current etcher-cli version
            cleepdesktop_version (string): current cleep-desktop version
        """
        infos = self.__check_etcher_updates(etcher_version)
        self.logger.debug('Check etcher version: %s' % infos)
        if infos.update_available:
            #set member to trigger download in run function
            self.__download_etcher = infos

        #TODO check cleepdesktop version

    def __update_etcher(self, filepath):
        """
        Update etcher software

        Args:
            filepath (string): etcher archive file path

        Returns:
            bool: True if install succeed, False otherwise
        """
        #prepare command
        command = self.INSTALL_ETCHER_COMMAND_LINUX % (self.cleep_path, filepath, self.cleep_path)
        self.logger.debug('Command executed to install etcher: %s' % command)

        #execute command
        c = Console()
        resp = c.command(command, 10.0)
        if resp['error'] or resp['killed']:
            self.logger.error('Unable to install etcher-cli: %s' % resp['stdout']+resp['stderr'])
            return False

        return True

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s %(name)s.%(funcName)s +%(lineno)s: %(levelname)-8s [%(process)d] %(message)s')
u = Updates()
u.start()
u.check_updates(None, None)

try:
    while True:
        time.sleep(.125)
except:
    pass
u.stop()
