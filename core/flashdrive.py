#!/usr/bin/env python
# -*- coding: utf-8 -*

import logging
import time
import os
import platform
import re
import tempfile
from core.libs.cleepwificonf import CleepWifiConf
from core.libs.download import Download
from core.utils import CleepDesktopModule
from core.libs.github import Github
from core.libs.raspbians import Raspbians
if platform.system()=='Windows':
    from core.libs.console import AdminEndlessConsole
    from core.libs.windowsdrives import WindowsDrives
    from core.libs.windowswirelessinterfaces import WindowsWirelessInterfaces
    from core.libs.windowswirelessnetworks import WindowsWirelessNetworks
elif platform.system()=='Darwin':
    from core.libs.diskutil import Diskutil
    from core.libs.console import AdminEndlessConsole
    from core.libs.macwirelessinterfaces import MacWirelessInterfaces
    from core.libs.macwirelessnetworks import MacWirelessNetworks
else:
    from core.libs.console import AdminEndlessConsole
    from core.libs.lsblk import Lsblk
    from core.libs.udevadm import Udevadm
    from core.libs.iw import Iw
    from core.libs.iwlist import Iwlist
    from core.libs.nmcli import Nmcli
    

class FlashDrive(CleepDesktopModule):
    """
    Flash drive helper
    """

    CACHE_DURATION = 600.0

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
    STATUS_ERROR_BADCHECKSUM = 9
    STATUS_ERROR_FLASH = 10
    STATUS_ERROR_NETWORK = 11
    STATUS_REQUEST_WRITE_PERMISSIONS = 12

    FLASH_LINUX = 'etcher-cli/flash.sh'
    FLASH_WINDOWS = 'etcher-cli\\flash.bat'
    FLASH_MAC = 'etcher-cli/flash.sh'
    
    CMDLOGGER_LINUX = 'cmdlogger-linux/cmdlogger'
    CMDLOGGER_WINDOWS = 'tools\\cmdlogger-windows\\cmdlogger.exe'
    CMDLOGGER_MAC = 'tools/cmdlogger-mac/cmdlogger'

    RASPIOT_REPO = {
        'owner': 'tangb',
        'repository': 'raspiot'
    }

    def __init__(self, app_path, config_path, update_callback, debug_enabled, crash_report):
        """
        Contructor

        Args:
            app_path (string): application path
            config_path (string): installation path
            update_callback (function): function to call when data need to be pushed to ui
            debug_enabled (bool): True if debug is enabled
            crash_report (CrashReport): crash report instance
        """
        CleepDesktopModule.__init__(self, debug_enabled, crash_report)

        #members
        self.app_path = app_path
        self.config_path = config_path
        self.crash_report = crash_report
        self.env = platform.system().lower()
        self.update_callback = update_callback
        self.console = None
        self.percent = 0
        self.total_percent = 0
        self.eta = 0
        self.status = self.STATUS_IDLE
        self.drive = None
        self.iso = None
        self.iso_sha256 = None
        self.isos = []
        self.url = None
        self.cancel = False
        self.timestamp_isos = 0
        self.__etcher_output_pattern = r'.*(Flashing|Validating)\s\[.*\]\s(\d+)%\seta\s(.*)'
        self.__flash_output_error = False
        self.wifi_config = None
        self.flashable_drives = []
        self.github = Github(self.RASPIOT_REPO['owner'], self.RASPIOT_REPO['repository'])
        self.raspbians = Raspbians(self.crash_report)
        self.isos_cached = {
            'isos': [],
            'cleepisos': 0,
            'raspbianisos': 0,
            'withraspbianiso': False,
            'withlocaliso': False
        }
       
        #prepare specific tools and flash commands
        if self.env=='windows':
            self.flash_cmd = os.path.join(self.config_path, self.FLASH_WINDOWS)
            self.windowsdrives = WindowsDrives()
            self.windowswirelessinterfaces = WindowsWirelessInterfaces()
            self.windowswirelessnetworks = WindowsWirelessNetworks()
        elif self.env=='linux':
            self.flash_cmd = os.path.join(self.config_path, self.FLASH_LINUX)
            self.iw = Iw()
            self.iwlist = Iwlist()
            self.nmcli = Nmcli()
            self.lsblk = Lsblk()
            self.udevadm = Udevadm()
        elif self.env=='darwin':
            self.flash_cmd = os.path.join(self.config_path, self.FLASH_MAC)
            self.diskutil = Diskutil()
            self.macwirelessinterfaces = MacWirelessInterfaces()
            self.macwirelessnetworks = MacWirelessNetworks()
        self.logger.debug('Flash command line: %s' % self.flash_cmd)

    def _custom_stop(self):
        """
        Stop flash. Called before stopping application
        """
        self.cancel = True

    def run(self):
        """
        Start flash process. Does nothing until start_flash is called
        """
        self.logger.debug('Flashdrive thread started')
        
        #precache wifi networks at startup
        self.get_wifi_networks()

        while self.running:
            #check if process requested
            if self.url and self.drive:
                self.logger.info('Flash process started')

                if self.__download_file():
                    #update ui
                    self.status = self.STATUS_REQUEST_WRITE_PERMISSIONS
                    self.logger.debug('Status after download: %s' % self.get_status())
                    self.update_callback(self.get_status())

                    #file downloaded successfully, launch flash+validation
                    self.__flash_drive()
                    #wait until end of flash (or if user cancel it)
                    while self.console is not None:
                        if self.cancel:
                            break
                        time.sleep(0.25)
                        
                    #end of process
                    if self.__flash_output_error:
                        #error occured during flash
                        self.status = self.STATUS_ERROR_FLASH
                    elif self.cancel:
                        #process canceled
                        self.console.kill()
                        self.status = self.STATUS_CANCELED
                    else:
                        #installation succeed
                        self.status = self.STATUS_DONE
                        
                    #update ui
                    self.logger.debug('Send status to ui: %s' % self.get_status())
                    self.update_callback(self.get_status())
                    
                elif self.cancel:
                    #handle cancelation
                    self.status = self.STATUS_CANCELED

                else:
                    #download failed. Status should already be setted by __download_file function
                    pass

                #reset everything
                self.logger.debug('Reset flash variables')
                self.total_percent = 100
                if self.iso and os.path.exists(self.iso):
                    self.logger.debug('Purge downloaded file')
                    dl = Download(None)
                    dl.purge_files()
                self.iso = None
                self.drive = None
                self.url = None
                self.cancel = False
                self.console = None
                try:
                    #remove temp wifi config file
                    if self.wifi_config and os.path.exists(self.wifi_config):
                        try:
                            self.logger.debug('Remove wifi config file')
                            os.remove(self.wifi_config)
                        except:
                            self.logger.exception('Unable to delete wifi config file %s:' % self.wifi_config)
                except:
                    pass
                self.logger.info('Flash process terminated')
                
                #update ui
                self.update_callback(self.get_status())

            else:
                #no process, release cpu
                time.sleep(0.25)

        self.logger.debug('Flashdrive thread stopped')

    def get_latest_raspbians(self):
        """
        Return latest raspbians releases

        Return:
            dict: raspbian and raspbian lite infos::
                {
                    raspbian: {
                        fileurl (string): file url
                        sha256 (string): sha256 checksum,
                        timestamp (int): timestamp of release
                    },
                    raspbian_lite: {
                        fileurl (string): file url
                        sha256 (string): sha256 checksum,
                        timestamp (int): timestamp of release
                    }
                }
        """
        raspbian_infos = None
        raspbian_lite_infos = None

        #get releases
        releases = self.raspbians.get_latest_raspbian_releases()
        self.logger.debug('Raspbian releases: %s' % releases)

        #get releases infos
        if releases['raspbian']:
            infos = self.raspbians.get_raspbian_release_infos(releases['raspbian'])
            if infos['url'] is not None:
                raspbian_infos = infos
            self.logger.debug('Raspbian release infos: %s' % raspbian_infos)

        if releases['raspbian_lite']:
            infos = self.raspbians.get_raspbian_release_infos(releases['raspbian_lite'])
            if infos['url'] is not None:
                raspbian_lite_infos = infos
            self.logger.debug('Raspbian lite release infos: %s' % raspbian_lite_infos)

        return {
            'raspbian': raspbian_infos,
            'raspbian_lite': raspbian_lite_infos
        }

    def get_latest_cleep(self):
        """
        Return latest cleep release

        Return:
            tuple: cleep release files and release version::
                (
                    {
                        fileurl (string): file url
                        sha256 (string): sha256 checksum,
                        timestamp (int): timestamp of release
                    },
                    string: release name (usually version)
                )
        """
        #get releases infos
        release = self.github.get_latest_release()
        self.logger.debug('Cleep release: %s' % release)

        #check if release exists
        if not release:
            return None, None
        else:
            return self.github.get_release_assets_infos(release), release['name']

    def start_flash(self, url, drive, wifi, iso_raspbian, iso_local):
        """
        Set flash data before launching process

        Args:
            url (string): url of file to use during flash
            drive (string): drive to flash
            wifi (dict): wifi configuration (dict('network':XXX, 'password':XXX, 'encryption':XXX))
            iso_raspbian (bool): function will also return raspbian isos
            iso_local (bool): function will set iso_local flag in process data
        """
        if url is None or len(url)==0:
            raise Exception('Invalid Url "%s"' % url)
        if drive is None or len(drive)==0:
            raise Exception('Invalid drive "%s"' % url)
        if self.url is not None or self.drive is not None:
            raise Exception('Installation is already running')
        if wifi and 'network' in wifi and (not 'password' in wifi or not 'encryption' in wifi):
            raise Exception('Missing wifi password or encryption value')

        #get checksum
        for iso in self.isos_cached['isos']:
            if iso['url']==url:
                self.logger.debug('Found sha256 "%s" for iso "%s"' % (iso['sha256'], url))
                self.iso_sha256 = iso['sha256']

        #generate wifi config file is needed
        wifi_config = None
        if wifi['network']:
            self.logger.debug('Start flash: wifi infos available')
            try:
                #prepare content
                cleepwificonf = CleepWifiConf()
                conf = cleepwificonf.create_content(wifi['network'], wifi['password'], wifi['encryption'])
                self.logger.debug('Generated wifi config file: %s' % conf)

                #write content
                wifi_config_file = tempfile.NamedTemporaryFile(mode='w+', delete=False)
                wifi_config = wifi_config_file.name
                wifi_config_file.write(conf)
                wifi_config_file.close()

            except:
                self.logger.exception('Unable to store wifi config:')
                wifi_config = None
        else:
            self.logger.debug('Start flash: no wifi info specified')

        #store data (setting self.url and self.drive will trigger flashing in run method)
        self.url = url
        self.drive = drive
        self.wifi_config = wifi_config
        self.logger.debug('Start flash: flash will start with values: %s %s %s' % (self.url, self.drive, self.wifi_config))

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
            list: removable drives list
                [
                    {
                        desc (string): drive description
                        path (string): drive path
                        readonly (bool): True if drive is readonly
                    },
                    ...
                ]
        """
        if self.env=='windows':
            self.flashable_drives = self.__get_flashable_drives_windows()
        elif self.env=='linux':
            self.flashable_drives = self.__get_flashable_drives_linux()
        elif self.env=='darwin':
            self.flashable_drives = self.__get_flashable_drives_mac()

        return self.flashable_drives

    def __get_flashable_drives_mac(self):
        """
        Return list of flashbable drives on windows

        Returns:
            list: removable drives list
                [
                    {
                        desc (string): drive description
                        path (string): drive path
                        readonly (bool): True if drive is readonly
                    },
                    ...
                ]
        """
        flashables = []

        #get drives
        drives = self.diskutil.get_devices_infos()
        self.logger.debug('drives=%s' % drives)

        #fill flashable drives list
        for drive in drives:
            if drives[drive][u'removable']:
                #save entry
                flashables.append({
                    'desc': '%s' % drives[drive]['name'],
                    'path': '%s' % drives[drive]['device'],
                    'readonly': drives[drive]['protected']
                })

        return flashables

    def __get_flashable_drives_windows(self):
        """
        Return list of flashbable drives on windows

        Returns:
            list: removable drives list
                [
                    {
                        desc (string): drive description
                        path (string): drive path
                        readonly (bool): True if drive is readonly
                    },
                    ...
                ]
        """
        flashables = []

        #get system drives
        drives = self.windowsdrives.get_drives()
        self.logger.debug('drives=%s' % drives)
        
        #fill flashable drives list
        for drive in drives:
            if drive['deviceType']==WindowsDrives.DEVICE_TYPE_REMOVABLE:
                #save entry
                flashables.append({
                    'desc': '%s (%s)' % (drive['description'], drive['displayName']),
                    'path': '%s' % drive['device'],
                    'readonly': drive['protected']
                })

        return flashables

    def __get_flashable_drives_linux(self):
        """
        Return list of flashbable drives on linux

        Returns:
            list: removable drives list
                [
                    {
                        desc (string): drive description
                        path (string): drive path
                        readonly (bool): True if drive is readonly
                    },
                    ...
                ]
        """
        flashables = []

        #get system drives
        drives = self.lsblk.get_drives()
        self.logger.debug('drives=%s' % drives)

        #get drives types
        for drive in drives:
            device_type = self.udevadm.get_device_type('/dev/%s' % drive)
            if device_type in (self.udevadm.TYPE_USB, self.udevadm.TYPE_SDCARD):
                #get human readble name for drive
                model = drives[drive]['drivemodel']
                if model is None or len(model)==0:
                    if device_type==self.udevadm.TYPE_USB:
                        desc = 'Unknown USB (/dev/%s)' % drive
                    if device_type==self.udevadm.TYPE_SDCARD:
                        desc = 'Unknown SD Card (/dev/%s)' % drive
                else:
                    desc = '%s (/dev/%s)' % (model, drive)

                #save entry
                flashables.append({
                    'desc': desc,
                    'path': '/dev/%s' % drive,
                    'readonly': drives[drive]['readonly']
                })

        return flashables

    def get_isos(self, with_iso_raspbian, with_iso_local):
        """
        Get list of isos file available

        Args:
            with_iso_raspbian (bool): function will also return raspbian isos
            with_iso_local (bool): just return iso local flag

        Return:
            dict:
                raspbian (bool): with raspbian iso,
                cleepisos (int): number of returned Cleep isos
                raspbianisos (int): number of returned Raspbian isos
                isos (list): list of isos available ordered by date
                    [
                        {
                            label (string): iso label,
                            url (string): file url,
                            timestamp (int): timestamp of isos,
                            category (string): entry category ('cleep' or 'raspbian')
                            sha256 (string): sha256 checksum
                        },
                        ...
                    ],
                withraspbianisos (bool): raspbian iso flag
                withlocalisos (bool): local iso flag
        """
        #return isos from cache
        refresh_isos = True
        if self.timestamp_isos==0 or len(self.isos)==0:
            #force refresh first time
            refresh_isos = True
        elif time.time()-self.timestamp_isos<=self.CACHE_DURATION:
            need_refresh = False
            if not with_iso_raspbian:
                #raspbian is not enabled in preferences
                for iso in self.isos:
                    if iso['category']=='raspbian':
                        #raspbians isos in list while options disabled, need to refresh list to remove entries
                        need_refresh = True
                        break
            else:
                #raspbian is enabled in preferences, by default need refresh...
                need_refresh = True
                for iso in self.isos:
                    if iso['category']=='raspbian':
                        #.. except if raspbians isos already retrieved
                        need_refresh = False
                        break

            if not need_refresh: 
                refresh_isos = False

        isos = []

        if refresh_isos:
            #get cleep latest release
            (cleep_release_files, cleep_release_name) = self.get_latest_cleep()
            self.logger.debug('Cleep %s: %s' % (cleep_release_name, cleep_release_files))
            if cleep_release_files:
                #search for .img and .sha256 files
                latest_cleep = {
                    'label': None,
                    'url': None,
                    'timestamp': 0,
                    'category': 'cleep',
                    'sha256': None
                }
                #look for cleep iso files (img and sha256)
                for file in cleep_release_files:
                    if file['name'].startswith('cleep_%s' % cleep_release_name) and file['name'].endswith('.zip'):
                        #image file found
                        latest_cleep['label'] = 'Cleep %s' % (cleep_release_name)
                        latest_cleep['timestamp'] = file['timestamp']
                        latest_cleep['url'] = file['url']
                    elif file['name'].startswith('cleep_%s' % cleep_release_name) and file['name'].endswith('.sha256'):
                        #checksum file, open it to get its content
                        sha256 = self.github.get_file_content(file['url'])
                        if sha256 and len(sha256.split())>0:
                            latest_cleep['sha256'] = sha256.split()[0]

                #save cleep iso
                if latest_cleep['label'] and latest_cleep['timestamp']!=0:
                    isos.append(latest_cleep)

            #get raspbian isos
            if with_iso_raspbian:
                raspbians = self.get_latest_raspbians()
                self.logger.debug('Raspbians: %s' % raspbians)
                if raspbians['raspbian_lite'] is not None:
                    isos.append({
                        'label': 'Raspbian Lite',
                        'url': raspbians['raspbian_lite']['url'],
                        'timestamp': raspbians['raspbian_lite']['timestamp'],
                        'category': 'raspbian',
                        'sha256': raspbians['raspbian_lite']['sha256']
                    })
                if raspbians['raspbian'] is not None:
                    isos.append({
                        'label': 'Raspbian desktop',
                        'url': raspbians['raspbian']['url'],
                        'timestamp': raspbians['raspbian']['timestamp'],
                        'category': 'raspbian',
                        'sha256': raspbians['raspbian']['sha256']
                    })

            self.logger.debug('Isos: %s' % isos)
            self.isos = sorted(isos, key=lambda i:i['timestamp'])
            self.timestamp_isos = time.time()

        else:
            self.logger.debug('Return isos list from cache')

        cleep_isos = 0
        raspbian_isos = 0
        for iso in self.isos:
            if iso['category']=='cleep':
                cleep_isos += 1
            elif iso['category']=='raspbian':
                raspbian_isos += 1

        #cache result
        self.isos_cached = {
            'isos': self.isos,
            'cleepisos': cleep_isos,
            'raspbianisos': raspbian_isos,
            'withraspbianiso': with_iso_raspbian,
            'withlocaliso': with_iso_local
        }
        return self.isos_cached

    def __download_callback(self, status, filesize, percent):
        """
        Download status callback

        Args:
            status (int): current download status
            filesize (int): downloaded filesize
            percent (int): percent of download
        """
        #adjust internal status according to download status
        if status==Download.STATUS_IDLE:
            self.status = self.STATUS_DOWNLOADING
        elif status==Download.STATUS_DOWNLOADING:
            self.status = self.STATUS_DOWNLOADING
        elif status==Download.STATUS_DOWNLOADING_NOSIZE:
            self.status = self.STATUS_DOWNLOADING_NOSIZE
        elif status==Download.STATUS_ERROR:
            self.status = self.STATUS_ERROR
        elif status==Download.STATUS_ERROR_INVALIDSIZE:
            self.status = self.STATUS_ERROR_INVALIDSIZE
        elif status==Download.STATUS_ERROR_BADCHECKSUM:
            self.status = self.STATUS_ERROR_BADCHECKSUM
        elif status==Download.STATUS_ERROR_NETWORK:
            self.status = self.STATUS_ERROR_NETWORK
        elif status==Download.STATUS_CANCELED:
            self.status = self.STATUS_CANCELED
        elif status==Download.STATUS_DONE:
            self.status = self.STATUS_DOWNLOADING

        #save current progress percentage 
        self.percent = percent
        self.total_percent = int(self.percent / 3)

        #save eta
        self.eta = '%.1fMo' % (float(filesize)/1000000.0)

        if self.cancel:
            #cancel download
            if self.dl:
                self.dl.cancel()

        #update ui
        self.update_callback(self.get_status())

    def __download_file(self):
        """
        Download file task
        """
        #check values
        if self.url is None or self.drive is None:
            self.logger.debug('No drive or url specified, flash process stopped')
            return False

        #check if it is local file
        if self.url.startswith('file://'):
            #local file, nothing to download but fake download values
            self.iso = self.url.replace('file://', '')
            self.status = self.STATUS_DOWNLOADING
            self.percent = 100
            self.total_percent = int(self.percent / 3)

            return True

        #init download helper
        self.dl = Download(self.__download_callback)

        #start download
        self.iso = self.dl.download_from_url(self.url, check_sha256=self.iso_sha256, cache=True)
        self.dl = None

        if self.iso is None:
            return False
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
            #self.logger.debug('Flash stdout=%s' % stdout)
            matches = re.finditer(self.__etcher_output_pattern, stdout, re.UNICODE | re.DOTALL)
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

                    #update ui
                    self.update_callback(self.get_status())
        except:
            if not self.__flash_output_error:
                self.crash_report.report_exception()
                self.logger.exception('Exception occured during flash callback:')
                self.__flash_output_error = True

    def __flash_end_callback(self):
        """
        Flash process ended callback
        """
        if self.console is None:
            #process surely canceled
            return

        #get console return code
        return_code = self.console.get_return_code()
        self.logger.info('Flash operation terminated with return code %s' % return_code)
                
        #check return code
        if return_code!=0:
            #flash failed
            self.logger.error('Flash failed. Return code awaited is 0, received %s' % return_code)
            self.__flash_output_error = True
        else:
            #reset console and set status
            self.__flash_output_error = False

        #update ui
        self.update_callback(self.get_status())
        
        #reset console
        self.console = None

    def __flash_drive(self):
        """
        Flash drive
        """
        if self.console is not None:
            raise Exception(u'Flashing operation is already running')

        self.status = self.STATUS_FLASHING
        try:
            #fix wifi config value, must be string
            wifi_config = self.wifi_config
            if wifi_config is None:
                wifi_config = ''

            #prepare command line
            cmd = [self.flash_cmd, self.config_path, self.drive, self.iso, wifi_config]
            self.logger.debug('Flash command to execute: %s' % cmd)

            #start command in admin endless console
            self.console = AdminEndlessConsole(cmd, self.__flash_callback, self.__flash_end_callback)
            if self.env=='windows':
                self.console.set_cmdlogger(os.path.join(self.app_path, self.CMDLOGGER_WINDOWS))
            elif self.env=='darwin':
                self.console.set_cmdlogger(os.path.join(self.app_path, self.CMDLOGGER_MAC))
            else:
                #workaround for AppImage issue https://github.com/AppImage/AppImageKit/issues/146
                #cmdlogger is copied under config directory like etcher
                self.console.set_cmdlogger(os.path.join(self.config_path, self.CMDLOGGER_LINUX))
            self.console.start()

        except:
            self.logger.exception('Exception occured during drive flashing:')
            self.__flash_output_error = True
            self.console = None

    def get_wifi_adapter(self):
        """
        Return wifi adapter status: exists or not

        Return:
            dict: adapter status::
                {
                    adapter (bool): True if wifi adapter found
                }
        """
        if self.env=='windows':
            adapter = self.__get_wifi_adapter_windows()
        elif self.env=='darwin':
            adapter = self.__get_wifi_adapter_mac()
        else:
            adapter = self.__get_wifi_adapter_linux()

        return {
            'adapter': adapter
        }

    def __get_wifi_adapter_linux(self):
        """
        Return wifi adapter status under linux

        Return:
            bool: True if adapter exists
        """
        #system check
        if not self.iw.is_installed():
            return False

        #get wifi interfaces
        wifi_connections = self.iw.get_connections()

        return len(wifi_connections.keys())>0

    def __get_wifi_adapter_windows(self):
        """
        Return wifi adapter status under windows

        Return:
            bool: True if adapter exists
        """
        #handle supported windows version
        supported = False
        try:
            release = int(platform.release())
            if release>=10:
                supported = True
        except:
            self.logger.exception('Unable to get wifi adapter status under windows:')
        if not supported:
            return False

        #get wifi interfaces
        wifi_interfaces = self.windowswirelessinterfaces.get_interfaces()

        return len(wifi_interfaces)>0

    def __get_wifi_adapter_mac(self):
        """
        Return wifi adapter status under macos

        Return:
            bool: True if adapter exists
        """
        #system check
        if not self.macwirelessinterfaces.is_installed():
            return False

        #get wifi interfaces
        wifi_interfaces = self.macwirelessinterfaces.get_interfaces()

        return len(wifi_interfaces)>0

    def get_wifi_networks(self):
        """
        Return wifi networks and wifi infos

        Return:
            dict: wifi infos::
                {
                    networks (list): networks list
                }
        """
        if self.env=='windows':
            networks = self.__get_wifi_networks_windows()
        elif self.env=='darwin':
            networks = self.__get_wifi_networks_mac()
        else:
            networks = self.__get_wifi_networks_linux()

        #sort wifi networks by name
        networks['networks'] = sorted(networks['networks'], key=lambda x: x['network'])

        self.logger.debug('wifi networks: %s' % networks)
        return networks

    def __get_wifi_networks_linux(self):
        """
        Return wifi networks and wifi infos for linux

        Return:
            dict: wifi infos::
                {
                    networks (list): networks list
                }
        """
        if self.nmcli.is_installed():
            #priority to nmcli if installed
            networks = self.nmcli.get_networks()

            #flatten dict
            wifi_networks = [v for k,v in networks.items()]

        elif self.iw.is_installed() and self.iwlist.is_installed():
            #otherwise fallback to iw/iwlist commands

            #get wifi interfaces
            wifi_connections = self.iw.get_connections()
            self.logger.debug('wifi_connections: %s' % wifi_connections)

            #get wifi networks
            wifi_networks = []
            if len(wifi_connections.keys())>0:
                #keep only first wifi interface
                interface = list(wifi_connections.keys())[0]
                networks = self.iwlist.get_networks(interface)

                #flatten dict
                wifi_networks = [v for k,v in networks.items()]

        else:
            self.logger.info('No command available to get list of wifi networks. Consider wifi is not available on this computer')
            wifi_networks = []
       
        #build output
        return {
            'networks': wifi_networks
        }

    def __get_wifi_networks_windows(self):
        """
        Return wifi networks and wifi infos for windows 10 and above only

        Return:
            dict: wifi infos::
                {
                    networks (list): networks list
                    adapter (bool): True if wifi adapter found
                }
        """
        default = {
            'networks': []
        }

        #handle supported windows version
        supported = False
        try:
            release = int(platform.release())
            if release>=10:
                supported = True
            else:
                self.logger.warning('Unable to get list of wifi networks, only windows>=10 is supported')
        except:
            self.logger.exception('Unable to get list of wifi networks:')
        if not supported:
            return default

        #get wifi interfaces
        wifi_interfaces = self.windowswirelessinterfaces.get_interfaces()
        self.logger.debug('wifi_interfaces: %s' % wifi_interfaces)

        #get wifi networks
        wifi_networks = []
        if len(wifi_interfaces)>0:
            interface = wifi_interfaces[0]
            networks = self.windowswirelessnetworks.get_networks(interface)
            self.logger.debug('networks: %s' % networks)

            #flatten dict
            wifi_networks = [v for k,v in networks.items()]
        
        #build output
        return {
            'networks': wifi_networks,
            'adapter': len(wifi_interfaces)>0
        }

    def __get_wifi_networks_mac(self):
        """
        Return wifi networks and wifi infos for macos

        Return:
            dict: wifi infos::
                {
                    networks (list): networks list
                    adapter (bool): True if wifi adapter found
                }
        """
        default = {
            'networks': [],
            'adapter': False
        }

        #system check
        if not self.macwirelessinterfaces.is_installed():
            self.logger.warning('MacWirelessInterfaces associated command not found on your system, unable to get list of wifi networks')
            return default

        elif not self.macwirelessnetworks.is_installed():
            self.logger.warning('MacWirelessNetworks associated command not found on your system, unable to get list of wifi networks')
            return default

        #get wifi interfaces
        wifi_interfaces = self.macwirelessinterfaces.get_interfaces()
        self.logger.debug('wifi_interfaces: %s' % wifi_interfaces)

        #get wifi networks
        wifi_networks = []
        if len(wifi_interfaces)>0:
            #keep only first wifi interface
            interface = wifi_interfaces[0]
            networks = self.macwirelessnetworks.get_networks(interface)

            #flatten dict
            wifi_networks = [v for k,v in networks.items()]
        
        #build output
        return {
            'networks': wifi_networks,
            'adapter': len(wifi_interfaces)>0
        }
