#!/usr/bin/env python
# -*- coding: utf-8 -*

import logging
import time
import os
import platform
import re
import tempfile
from operator import itemgetter
from core.libs.cleepwificonf import CleepWifiConf
from core.libs.download import Download
from core.utils import CleepDesktopModule
from core.libs.github import Github
from core.libs.raspios import Raspios
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
    

class Install(CleepDesktopModule):
    """
    Install iso helper
    """

    CACHE_DURATION = 900.0

    TMP_FILE_PREFIX = 'cleep_iso'

    STATUS_IDLE = 0
    STATUS_DOWNLOADING = 1
    STATUS_DOWNLOADING_NOSIZE = 2
    STATUS_FLASHING = 3
    STATUS_VALIDATING = 4
    STATUS_REQUEST_WRITE_PERMISSIONS = 5
    STATUS_DONE = 6
    STATUS_CANCELED = 7
    STATUS_ERROR = 8
    STATUS_ERROR_INVALIDSIZE = 9
    STATUS_ERROR_BADCHECKSUM = 10
    STATUS_ERROR_FLASH = 11
    STATUS_ERROR_NETWORK = 12

    FLASH_LINUX = 'balena-cli/flash.sh'
    FLASH_WINDOWS = 'balena-cli\\flash.bat'
    FLASH_MAC = 'balena-cli/flash.sh'
    
    CMDLOGGER_LINUX = 'cmdlogger-linux/cmdlogger'
    CMDLOGGER_WINDOWS = 'tools\\cmdlogger-windows\\cmdlogger.exe'
    CMDLOGGER_MAC = 'tools/cmdlogger-mac/cmdlogger'

    RASPIOT_REPO = {
        'owner': 'tangb',
        'repository': 'cleep-os'
    }

    def __init__(self, context, debug_enabled):
        """
        Contructor

        Args:
            context (AppContext): application context
            debug_enabled (bool): True if debug is enabled
        """
        CleepDesktopModule.__init__(self, context, debug_enabled)

        #members
        self.env = platform.system().lower()
        self.console = None
        self.percent = 0
        self.__last_percent = 0
        self.total_percent = 0
        self.eta = 0
        self.status = self.STATUS_IDLE
        self.__last_status = self.STATUS_IDLE
        self.drive = None
        self.iso = None
        self.iso_sha256 = None
        self.isos = []
        self.url = None
        self.cancel = False
        self.__etcher_output_pattern = r'.*(Flashing|Validating)\s\[.*\]\s(\d+)%\seta\s(.*)'
        self.__flash_output_error = False
        self.wifi_config = None
        self.flashable_drives = []
        self.github = Github(self.RASPIOT_REPO['owner'], self.RASPIOT_REPO['repository'])
        self.raspios = Raspios(self.context.crash_report)
        self.isos_cached = {
            'lastupdate': 0,
            'isos': [],
            'cleepisos': 0,
            'raspiosisos': 0,
            'withraspiosisos': False,
            'withlocalisos': False
        }
       
        #prepare specific tools and flash commands
        if self.env=='windows':
            self.flash_cmd = os.path.join(self.context.paths.config, self.FLASH_WINDOWS)
            self.windowsdrives = WindowsDrives()
            self.windowswirelessinterfaces = WindowsWirelessInterfaces()
            self.windowswirelessnetworks = WindowsWirelessNetworks()
        elif self.env=='linux':
            self.flash_cmd = os.path.join(self.context.paths.config, self.FLASH_LINUX)
            self.iw = Iw()
            self.iwlist = Iwlist()
            self.nmcli = Nmcli()
            self.lsblk = Lsblk()
            self.udevadm = Udevadm()
        elif self.env=='darwin':
            self.flash_cmd = os.path.join(self.context.paths.config, self.FLASH_MAC)
            self.diskutil = Diskutil()
            self.macwirelessinterfaces = MacWirelessInterfaces()
            self.macwirelessnetworks = MacWirelessNetworks()
        self.logger.debug('Flash command line: %s' % self.flash_cmd)

    def _custom_stop(self):
        """
        Stop flash. Called before stopping application
        """
        self.cancel = True

    def __update_ui(self):
        """
        Update ui if necessary
        """
        if self.__last_percent!=self.percent or self.__last_status!=self.status:
            self.context.update_ui('install', self.get_status())
            self.__last_percent = self.percent
            self.__last_status = self.status

    def run(self):
        """
        Start install background task. Does nothing until start_install is called
        """
        self.logger.debug('Flashdrive thread started')
        
        #precache wifi networks at startup
        self.get_wifi_networks()

        while self.running:
            #check if process requested
            if self.url and self.drive:
                self.logger.info('Install process started')

                if self.__download_file():
                    #update ui
                    self.status = self.STATUS_REQUEST_WRITE_PERMISSIONS
                    self.logger.debug('Status after download: %s' % self.get_status())
                    self.__update_ui()

                    #file downloaded successfully, launch flash+validation
                    self.__flash_drive()
                    #wait until end of flash (or if user cancel it)
                    while self.console is not None:
                        if self.cancel:
                            break
                        time.sleep(0.25)
                        
                    #end of process
                    if self.cancel:
                        #process canceled
                        self.console.kill()
                        self.status = self.STATUS_CANCELED
                    if self.__flash_output_error:
                        #error occured during flash
                        self.status = self.STATUS_ERROR_FLASH
                    else:
                        #installation succeed
                        self.status = self.STATUS_DONE
                        
                    #update ui
                    self.__update_ui()
                    
                elif self.cancel:
                    #handle cancelation
                    self.status = self.STATUS_CANCELED

                else:
                    #download failed. Status should already be setted by __download_file function
                    pass

                #reset everything
                self.logger.debug('Reset install variables')
                self.total_percent = 100
                if self.iso and os.path.exists(self.iso):
                    self.logger.debug('Purge downloaded file')
                    dl = Download(self.context.paths.cache)
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
                self.logger.info('Install process terminated')
                
                #update ui
                self.__update_ui()

            else:
                #no process, release cpu
                time.sleep(0.25)

        self.logger.debug('Flashdrive thread stopped')

    def get_latest_raspios(self):
        """
        Return latest raspios releases

        Returns:
            dict: raspios and raspios lite infos::
                {
                    raspios: {
                        fileurl (string): file url
                        sha256 (string): sha256 checksum,
                        timestamp (int): timestamp of release
                    },
                    raspios_lite: {
                        fileurl (string): file url
                        sha256 (string): sha256 checksum,
                        timestamp (int): timestamp of release
                    }
                }
        """
        raspios_infos = None
        raspios_lite_infos = None

        #get releases
        releases = self.raspios.get_latest_raspios_releases()
        self.logger.debug('Raspios releases: %s' % releases)

        #get releases infos
        if releases['raspios']:
            infos = self.raspios.get_raspios_release_infos(releases['raspios'])
            if infos['url'] is not None:
                raspios_infos = infos
            self.logger.debug('Raspios release infos: %s' % raspios_infos)

        if releases['raspios_lite']:
            infos = self.raspios.get_raspios_release_infos(releases['raspios_lite'])
            if infos['url'] is not None:
                raspios_lite_infos = infos
            self.logger.debug('Raspios lite release infos: %s' % raspios_lite_infos)

        return {
            'raspios': raspios_infos,
            'raspios_lite': raspios_lite_infos
        }

    def get_latest_cleep(self):
        """
        Return latest cleep release

        Returns:
            tuple: cleep release files and release version::
                (
                    [{
                        name (string): release name
                        url (string): file url
                        size (int): filesize
                        timestamp (int): timestamp of release
                    }],
                    string: release name (usually version)
                )
        """
        #get releases infos from github
        release = self.github.get_latest_release()
        self.logger.debug('Cleep release: %s' % release)

        #check if release exists
        if not release:
            #no release found, surely rate limit reached on github api
            #fallback to cached releases
            download = Download(self.context.paths.cache)
            cached_releases = download.get_cached_files()
            self.logger.debug('Cached releases: %s' % cached_releases)

            if len(cached_releases)>0:
                #sort to keep recent one
                cached_releases_sorted = sorted(cached_releases, key=itemgetter('timestamp'))
                cached_releases_sorted.reverse()
                for cached_release in cached_releases_sorted:
                    if cached_release['filename'].startswith('cleep_'):
                        #and return it
                        return [{
                            'name': cached_release['filename'],
                            'url': 'file://%s' % cached_release['filepath'],
                            'size': cached_release['filesize'],
                            'timestamp': cached_release['timestamp']
                        }], cached_release['filename'].replace('cleep_', '').replace('.zip', '')

                #no cleep cached
                return None, None

            else:
                #no file cached
                return None, None
        else:
            return self.github.get_release_assets_infos(release), release['name']

    def start_install(self, url, drive, wifi):
        """
        Set install data before launching process

        Args:
            url (string): url of file to use during install
            drive (string): drive to install
            wifi (dict): wifi configuration::
            
                {
                    network (string): network name,
                    password (string): network password,
                    encryption (string): encryption (wpa|wpa2|wep|unsecured),
                    hidden (bool): hidden network
                }

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
                break

        #generate wifi config file is needed
        wifi_config = None
        if wifi and wifi['network']:
            self.logger.debug('Start install: wifi infos available')
            try:
                #prepare content
                cleepwificonf = CleepWifiConf()
                conf = cleepwificonf.create_content(wifi['network'], wifi['password'], wifi['encryption'], wifi['hidden'])
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
            self.logger.debug('Start install: no wifi info specified')

        #store data (setting self.url and self.drive will trigger install in run method)
        self.url = url
        self.drive = drive
        self.wifi_config = wifi_config
        self.logger.debug('Start install: install will start with values: %s %s %s' % (self.url, self.drive, self.wifi_config))

    def cancel_install(self):
        """
        Cancel current process
        """
        self.logger.debug('Install canceled')
        self.cancel = True

    def get_status(self):
        """
        Return current install process percent

        Returns:
            int: install process percent
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
                        size (int): media size
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
            if drives[drive]['removable']:
                #save entry
                flashables.append({
                    'desc': '%s' % drives[drive]['name'],
                    'path': '%s' % drives[drive]['device'],
                    'readonly': drives[drive]['protected'],
                    'size': drives[drive]['totalsize']
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
                        readonly (bool): True if drive is readonly,
                        size (int): media size
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
                    'readonly': drive['protected'],
                    'size': drive['size']
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
                        readonly (bool): True if drive is readonly,
                        size (int): media size
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
                    'readonly': drives[drive]['readonly'],
                    'size': drives[drive]['size']
                })

        return flashables

    def get_isos(self, force_refresh=False):
        """
        Get list of isos file available

        Args:
            force_refresh (bool): force refresh

        Returns:
            dict:
                lastupdate (float): last update
                raspios (bool): with raspios iso,
                cleepisos (int): number of returned Cleep isos
                raspiosisos (int): number of returned raspios isos
                isos (list): list of isos available ordered by date
                    [
                        {
                            label (string): iso label,
                            url (string): file url,
                            timestamp (int): timestamp of isos,
                            category (string): entry category ('cleep' or 'raspios')
                            sha256 (string): sha256 checksum
                        },
                        ...
                    ],
                withraspiosisos (bool): raspios iso flag
                withlocalisos (bool): local iso flag
        """
        with_raspios_isos = self.context.config.get_config_value('cleep.isoraspios')
        with_local_isos = self.context.config.get_config_value('cleep.isolocal')

        self.logger.debug('===> getisos %s' % self.isos_cached)
        #return isos from cache
        refresh_isos = False
        if force_refresh is True:
            #refresh forced
            self.logger.debug('Force refresh isos enabled')
            refresh_isos = True
        elif self.isos_cached['lastupdate']==0 or len(self.isos)==0:
            #force refresh first time
            self.logger.debug('First isos checking, refresh isos list')
            refresh_isos = True
        elif time.time()-self.isos_cached['lastupdate']>self.CACHE_DURATION:
            #cache duration expired, refresh needed
            self.logger.debug('Cache expired, refresh isos list')
            refresh_isos = True
        elif self.isos_cached['withraspiosisos']!=with_raspios_isos:
            #preferences changed, refresh needed
            self.logger.debug('Preferences changes, refresh isos list')
            refresh_isos = True

        if not refresh_isos:
            #no refresh needed, return cache (with updated local isos value)
            self.logger.debug('Return isos list from cache')
            self.isos_cached['withlocalisos'] = with_local_isos
            return self.isos_cached

        #get cleep latest release
        isos = []
        (cleep_release_file, cleep_release_name) = self.get_latest_cleep()
        self.logger.debug('Cleep %s: %s' % (cleep_release_name, cleep_release_file))
        if cleep_release_file:
            #search for .img and .sha256 files
            latest_cleep = {
                'label': None,
                'url': None,
                'timestamp': 0,
                'category': 'cleep',
                'sha256': None
            }
            #look for cleep iso files (img and sha256)
            for file in cleep_release_file:
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

        #get raspios isos
        if with_raspios_isos:
            raspios = self.get_latest_raspios()
            self.logger.debug('Raspios: %s' % raspios)
            if raspios['raspios_lite'] is not None:
                isos.append({
                    'label': 'Raspios Lite',
                    'url': raspios['raspios_lite']['url'],
                    'timestamp': raspios['raspios_lite']['timestamp'],
                    'category': 'raspios',
                    'sha256': raspios['raspios_lite']['sha256']
                })
            if raspios['raspios'] is not None:
                isos.append({
                    'label': 'Raspios desktop',
                    'url': raspios['raspios']['url'],
                    'timestamp': raspios['raspios']['timestamp'],
                    'category': 'raspios',
                    'sha256': raspios['raspios']['sha256']
                })

        self.logger.debug('Isos: %s' % isos)
        self.isos = sorted(isos, key=lambda i:i['timestamp'])

        cleep_isos = 0
        raspios_isos = 0
        for iso in self.isos:
            if iso['category']=='cleep':
                cleep_isos += 1
            elif iso['category']=='raspios':
                raspios_isos += 1

        #save new cache
        self.isos_cached = {
            'lastupdate': time.time(),
            'isos': self.isos,
            'cleepisos': cleep_isos,
            'raspiosisos': raspios_isos,
            'withraspiosisos': with_raspios_isos,
            'withlocalisos': with_local_isos
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
        self.__update_ui()

    def __download_file(self):
        """
        Download file task
        """
        #check values
        if self.url is None or self.drive is None:
            self.logger.debug('No drive or url specified, install process stopped')
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
        self.dl = Download(self.context.paths.cache, self.__download_callback)

        #start download
        self.iso = self.dl.download_from_url(self.url, check_sha256=self.iso_sha256, cache=True)
        self.dl = None

        if self.iso is None:
            return False
        return True

    def __install_callback(self, stdout, stderr):
        """
        Install process callback

        Args:
            stdout (string): stdout message
            stderr (string): stderr message
        """
        #handle current flasing/validating status
        try:
            #self.logger.debug('Install stdout=%s' % stdout)
            matches = re.finditer(self.__etcher_output_pattern, stdout, re.UNICODE | re.DOTALL)
            for _, match in enumerate(matches):
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
                    self.__update_ui()
        except:
            if not self.__flash_output_error:
                self.context.crash_report.report_exception()
                self.logger.exception('Exception occured during install callback:')
                self.__flash_output_error = True

    def __install_end_callback(self):
        """
        Install process ended callback
        """
        if self.console is None:
            #process surely canceled
            return

        #get console return code
        return_code = self.console.get_return_code()
        self.logger.info('Install process terminated with return code %s' % return_code)
                
        #check return code
        if return_code!=0:
            #install failed
            self.logger.error('Install failed. Return code awaited is 0, received %s' % return_code)
            self.__flash_output_error = True
        else:
            #reset console and set status
            self.__flash_output_error = False

        #update ui
        self.__update_ui()
        
        #reset console
        self.console = None

    def __flash_drive(self):
        """
        Flash drive
        """
        if self.console is not None:
            raise Exception('Flashing operation is already running')

        self.status = self.STATUS_FLASHING
        try:
            #fix wifi config value, must be string
            wifi_config = self.wifi_config
            if wifi_config is None:
                wifi_config = ''

            #prepare command line
            cmd = [self.flash_cmd, self.context.paths.config, self.drive, self.iso, wifi_config]
            self.logger.debug('Flash command to execute: %s' % cmd)

            #start command in admin endless console
            self.console = AdminEndlessConsole(cmd, self.__install_callback, self.__install_end_callback)
            if self.env=='windows':
                self.console.set_cmdlogger(os.path.join(self.context.paths.app, self.CMDLOGGER_WINDOWS))
            elif self.env=='darwin':
                self.console.set_cmdlogger(os.path.join(self.context.paths.app, self.CMDLOGGER_MAC))
            else:
                #workaround for AppImage issue https://github.com/AppImage/AppImageKit/issues/146
                #cmdlogger is copied under config directory like etcher
                self.console.set_cmdlogger(os.path.join(self.context.paths.config, self.CMDLOGGER_LINUX))
            self.console.start()

        except:
            self.logger.exception('Exception occured during drive flashing:')
            self.__flash_output_error = True
            self.console = None

    def get_wifi_adapter(self):
        """
        Return wifi adapter status: exists or not

        Returns:
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

        Returns:
            bool: True if adapter exists
        """
        # system check
        if not self.iw.is_installed():
            return False

        # get wifi interfaces
        wifi_adapters = self.iw.get_adapters()

        return len(wifi_adapters.keys())>0

    def __get_wifi_adapter_windows(self):
        """
        Return wifi adapter status under windows

        Returns:
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

        Returns:
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

        Returns:
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

        Returns:
            dict: wifi infos::
                {
                    networks (list): networks list
                }
        """
        wifi_networks = []
        if self.nmcli.is_installed():
            #priority to nmcli if installed
            self.logger.debug('Use nmcli to find wifi networks')

            interfaces = self.nmcli.get_wifi_interfaces()
            self.logger.debug('nmcli wifi interfaces: %s' % interfaces)
            if len(interfaces)>0:
                #keep only first interface
                interface = interfaces[0]

                networks = self.nmcli.get_wifi_networks(interface)
                self.logger.debug('nmcli wifi networks: %s' % networks)

                #flatten dict
                wifi_networks = [v for k,v in networks.items()]

        elif self.iw.is_installed() and self.iwlist.is_installed():
            #otherwise fallback to iw/iwlist commands
            self.logger.debug('Use iw to find wifi networks')

            #get wifi interfaces
            wifi_connections = self.iw.get_connections()
            self.logger.debug('wifi_connections: %s' % wifi_connections)

            #get wifi networks
            if len(wifi_connections.keys())>0:
                #keep only first wifi interface
                interface = list(wifi_connections.keys())[0]
                networks = self.iwlist.get_networks(interface)

                #flatten dict
                wifi_networks = [v for k,v in networks.items()]

        else:
            self.logger.info('No system command available to get list of wifi networks. Consider wifi is not available on this computer')
       
        #build output
        return {
            'networks': wifi_networks
        }

    def __get_wifi_networks_windows(self):
        """
        Return wifi networks and wifi infos for windows 10 and above only

        Returns:
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

        Returns:
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
