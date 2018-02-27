#!/usr/bin/env python
# -*- coding: utf-8 -*

import logging
from threading import Thread
import time
import os
import urllib3
import platform
import json
import datetime
from cleep.libs.download import Download
from cleep.libs.console import Console
from cleep.libs.github import Github
from cleep.utils import CleepDesktopModule
from cleep.flashdrive import FlashDrive


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


class Updates(CleepDesktopModule):
    """
    Updates manager: it can update etcher-cli and CleepDesktop files
    """

    ETCHER_RELEASES = 'https://api.github.com/repos/resin-io/etcher/releases'
    CLEEPDESKTOP_RELEASES = 'https://api.github.com/repos/tangb/CleepDesktop/releases'

    INSTALL_ETCHER_COMMAND_LINUX = '%s/scripts/install_etcher.linux "%s" "%s" "%s"'
    INSTALL_ETCHER_COMMAND_WINDOWS = '%s\\scripts\\install_etcher.windows.bat "%s" "%s" "%s"'
    INSTALL_ETCHER_COMMAND_MAC = '%s/scripts/install_etcher.mac "%s" "%s" "%s"'

    STATUS_IDLE = 0
    STATUS_DOWNLOADING = 1
    STATUS_INSTALLING = 2
    STATUS_DONE = 3
    STATUS_ERROR = 4

    ETCHER_VERSION_FORCED = "v1.2.0"

    def __init__(self, app_path, config_path, cleep_version, etcher_version, update_callback, debug_enabled, crash_report):
        """
        Constructor

        Args:
            app_path (string): absolute application path
            config_path (string): path to install extra tools (etcher)
            cleep_version (string): current cleepdesktop version
            etcher_version (string): current etcher-cli version
            update_callback (function): function to call when data need to be updated on ui
            debug_enabled (bool): True if debug is enabled
            crash_report (CrashReport): crash report instance
        """
        CleepDesktopModule.__init__(self, debug_enabled, crash_report)

        #members
        self.app_path = app_path
        if len(self.app_path)==0:
            self.app_path = '.'
        self.config_path = config_path
        self.update_callback = update_callback
        self.http_headers =  {'user-agent':'Mozilla/5.0 (Windows NT 6.3; rv:36.0) Gecko/20100101 Firefox/36.0'}
        self.http = urllib3.PoolManager(num_pools=1)
        self.__download_etcher = None
        self.__download_cleep = None
        self.__current_download = None

        self.etcher_version = etcher_version
        self.etcher_status = self.STATUS_IDLE
        self.etcher_download_status = Download.STATUS_IDLE
        self.etcher_download_percent = 0

        self.cleep_version = cleep_version
        self.cleep_status = self.STATUS_IDLE
        self.cleep_download_status = Download.STATUS_IDLE
        self.cleep_download_percent = 0
        
        #running env
        self.env = platform.system().lower()
        self.arch64 = platform.machine().endswith('64')

        self.last_update = 0

    def _custom_stop(self):
        """
        Stop process
        """
        self.logger.debug('Stop update')
        self.cancel_download()

    def cancel_download(self):
        """
        Cancel current download
        """
        self.logger.debug('Cancel download')
        #reset update flags
        self.__download_etcher = None
        self.__download_cleep = None

        #and cancel current download
        if self.__current_download:
            self.__current_download.cancel()

    def get_status(self):
        """
        Return current update status

        Returns:
            dict: current update status informations::
                {
                    etcherstatus (int): current etcher update status (see Updates.STATUS_*)
                    etcherdownload (int): etcher download status (see Download.STATUS_*)
                    etcherpercent (int): etcher current download percentage
                    etcherversion (string): current etcher version
                    cleepstatus (int): current cleep update status (see Updates.STATUS_*)
                    cleepdownload (int): cleep download status (see Download.STATUS_*)
                    cleeppercent (int): cleep current download percentage
                    cleepversion (string): current cleep version,
                    lastcheck (int): timestamp of last check
                }
        """
        return {
            'etcherversion': self.etcher_version,
            'etcherstatus': self.etcher_status,
            'etcherdownloadstatus': self.etcher_download_status,
            'etcherdownloadpercent': self.etcher_download_percent,

            'cleepversion': self.cleep_version,
            'cleepstatus': self.cleep_status,
            'cleepdownloadstatus': self.cleep_download_status,
            'cleepdownloadpercent': self.cleep_download_percent,

            'lastcheck': self.last_check
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
        if self.etcher_status==self.STATUS_DOWNLOADING:
            self.etcher_download_status = status
            self.etcher_download_percent = percent
    
        elif self.cleep_status==self.STATUS_DOWNLOADING:
            self.cleep_download_status = status
            self.cleep_download_percent = percent
        
        #update ui
        self.update_callback(self.get_status())

    def run(self):
        """
        Start update process. Does nothing until check_updates is called and trigger update if necessary
        """
        self.running = True
        self.logger.debug('Updates thread started')

        #check updates at startup
        self.check_updates()

        #endless loop
        while self.running:

            if self.__download_etcher:
                try:
                    self.logger.info('Downloading Etcher archive %s (%s)' % (self.__download_etcher.filename, self.__download_etcher.url))
                    #update etcher status
                    self.etcher_status = self.STATUS_DOWNLOADING
                    #new etcher update available
                    self.__current_download = Download(self.__download_callback)
                    #download it with no checksum (call is blocking)
                    filepath = self.__current_download.download_from_url(self.__download_etcher.url)
                    #end of dowload, trigger callback and reset member
                    self.__current_download = None
                    #update etcher status
                    if self.etcher_download_status==Download.STATUS_DONE:
                        self.etcher_status = self.STATUS_INSTALLING
                    else:
                        self.etcher_status = self.STATUS_ERROR
                    self.update_callback(self.get_status())

                    if filepath:
                        self.logger.debug('Etcher archive downloaded')
                        #process downloaded archive
                        if not self.__update_etcher(filepath):
                            self.etcher_status = self.STATUS_ERROR
                            self.logger.error('Etcher installation failed')
                        else:
                            self.etcher_status = self.STATUS_DONE
                            self.etcher_version = self.__download_etcher.version
                            self.logger.info('Etcher installation succeed (installed version is now %s)' % self.__download_etcher.version)

                        self.update_callback(self.get_status())

                    else:
                        #error downloading etcher archive
                        self.logger.error('Failed to download Etcher archive.')
                        self.etcher_status = self.STATUS_ERROR
                        self.update_callback(self.get_status())

                except:
                    #exception during update
                    self.logger.exception('Exception during etcher-cli update:')
                    self.etcher_status = self.STATUS_ERROR
                    self.update_callback(self.get_status())

                finally:
                    #end of etcher update process, reset variables
                    self.__download_etcher = None

            if self.__download_cleep:
                #TODO new CleepDesktop update available
                pass

            #release CPU
            time.sleep(1.0)

        self.logger.debug('Updates thread stopped')

    def __get_etcher_version_infos(self, assets):
        """
        Search for file to download for current user environment

        Args:
            asset (dict): release assets

        Returns:
            tuple (string, string, int): release filename, release url (ready to download) and filesize (in bytes)
        """
        #get environment and architecture
        pattern = None
        if self.env=='linux':
            pattern = 'linux-x86'
            if self.arch64:
                pattern = 'linux-x64'
        elif self.env=='darwin':
            pattern = 'darwin'
        elif self.env=='windows':
            pattern = 'win32-x86'
            if self.arch64:
                pattern = 'win32-x64'
        self.logger.debug('Search release using pattern: %s' % pattern)

        #search for release
        for asset in assets:
            if 'browser_download_url' and 'size' and 'name' in asset.keys():
                name = asset['name'].lower()
                if name.find('etcher')>=0 and name.find('cli')>=0 and name.find(pattern)>=0:
                    #version found, return infos
                    self.logger.debug('Found release: %s' % asset)
                    return asset['name'], asset['browser_download_url'], asset['size']

        #nothing found
        raise Exception('No release info found')

    def __check_etcher_updates(self, etcher_version):
        """
        Check if etcher updates are available

        Args:
            etcher_version (string): current installed etcher version

        Returns:
            UpdateInfos: UpdateInfos instance
        """
        infos = UpdateInfos()
        github = Github('resin-io', 'etcher')

        #etcher-cli path for test it is installed
        if self.env=='linux':
            etchercli_script_path = FlashDrive.ETCHER_LINUX
        elif self.env=='darwin':
            etchercli_script_path = FlashDrive.ETCHER_MAC
        elif self.env=='windows':
            etchercli_script_path = FlashDrive.ETCHER_WINDOWS

        #handle forced version
        if self.ETCHER_VERSION_FORCED is not None and self.ETCHER_VERSION_FORCED!=etcher_version:
            #force etcher-cli installation to specific version
            self.logger.debug('Force etcher-cli installation (forced version=%s, installed version=%s)' % (self.ETCHER_VERSION_FORCED, etcher_version))

            try:
                #get forced release
                release = github.get_release(self.ETCHER_VERSION_FORCED)

                #get download url
                (infos.filename, infos.url, infos.size) = self.__get_etcher_version_infos(release['assets'])
                infos.version = self.ETCHER_VERSION_FORCED
                infos.update_available = True

            except:
                self.logger.exception('Forced Etcher-cli release not found:')

            return infos

        elif self.ETCHER_VERSION_FORCED is not None:
            #forced version already installed, stop statement
            return infos

        #handle latest release
        try:
            latest = github.get_latest_release()

            if not os.path.exists(os.path.join(self.config_path, 'etcher-cli')) or not os.path.exists(os.path.join(self.config_path, etchercli_script_path)):
                #etcher-cli is not installed
                self.logger.debug('No etcher-cli found. Installation is necessary')
                infos.version = latest['tag_name']
                infos.update_available = True
                (infos.filename, infos.url, infos.size) = self.__get_etcher_version_infos(latest['assets'])

            elif latest['tag_name']!=etcher_version:
                #new version available, find cli version for current user platform
                self.logger.debug('Update available (online version=%s, installed version=%s)' % (latest['tag_name'], etcher_version))
                infos.version = latest['tag_name']
                infos.update_available = True
                (infos.filename, infos.url, infos.size) = self.__get_etcher_version_infos(latest['assets'])

            else:
                self.logger.debug('No new etcher version available')

        except:
            self.logger.exception('Latest Etcher-cli release not found:')

        return infos

    def __check_cleepdesktop_updates(self):
        """
        Check if CleepDesktop updates are available
        """
        #TODO implement CleepDesktop updates as soon as github is configured
        pass

    def check_updates(self):
        """
        Check for available updates

        Return:
            dict: check output::
                {
                    updateavailable (bool): True if update is available
                    lastcheck (int): timestamp of last check
                }
        """
        #update last check timestamp and versions
        self.last_check = int(time.time())

        #check etcher
        infos = self.__check_etcher_updates(self.etcher_version)
        self.logger.debug('Check etcher version: %s' % infos)
        if infos.update_available:
            #set member to trigger download in run function
            self.__download_etcher = infos

        #TODO check cleepdesktop version

        #prepare output
        update_available = False
        if self.__download_etcher is not None or self.__download_cleep is not None:
            update_available = True

        return {
            'updateavailable': update_available,
            'lastcheck': self.last_check
        }

    def __update_etcher(self, archive_path):
        """
        Update etcher software

        Args:
            archive_path (string): etcher archive file path

        Returns:
            bool: True if install succeed, False otherwise
        """
        #prepare command
        command = None
        if self.env=='linux':
            command = self.INSTALL_ETCHER_COMMAND_LINUX % (self.app_path, archive_path, self.app_path, self.config_path)
        elif self.env=='darwin':
            command = self.INSTALL_ETCHER_COMMAND_MAC % (self.app_path, archive_path, self.app_path, self.config_path)
        elif self.env=='windows':
            command = self.INSTALL_ETCHER_COMMAND_WINDOWS % (self.app_path, archive_path, self.app_path, self.config_path)
        self.logger.debug('Command executed to install etcher: %s' % command)

        #execute command
        c = Console()
        resp = c.command(command, 20.0)
        if resp['error'] or resp['killed']:
            self.logger.error('Unable to install etcher-cli: stdout: %s' % (resp['stdout']))
            self.logger.error('Unable to install etcher-cli: stderr: %s' % (resp['stderr']))
            return False

        return True

#logging.basicConfig(level=logging.DEBUG, format='%(asctime)s %(name)s.%(funcName)s +%(lineno)s: %(levelname)-8s [%(process)d] %(message)s')
#u = Updates()
#u.start()
#u.check_updates(None, None)
#
#try:
#    while True:
#        time.sleep(.125)
#except:
#    pass
#u.stop()
