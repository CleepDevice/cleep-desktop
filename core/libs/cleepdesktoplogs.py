#!/usr/bin/env python
# -*- coding: utf-8 -*

import logging
import os
import zipfile
import tempfile
import uuid
import platform

class CleepDesktopLogs():
    """
    Handle cleepdesktop logs files
    """

    LOGS_CORE = 'cleepdesktopcore.log'
    LOGS_UI = 'log.log'

    #those paths are based on electron-log doc (https://github.com/megahertz/electron-log)
    PATH_LINUX = '~/.config/CleepDesktop'
    PATH_MAC = '~/Library/Logs/CleepDesktop'
    PATH_WIN = '%USERPROFILE%\\AppData\\Roaming\\CleepDesktop'

    def __init__(self):
        """
        Constructor

        Args:
            logs_path (string): path of logs files
        """
        #logger
        self.logger = logging.getLogger(self.__class__.__name__)
        #self.logger.setLevel(logging.DEBUG)

        #build logs path according to platform
        if platform.system()=='Windows':
            self.logs_path = os.path.expandvars(self.PATH_WIN)
        elif platform.system()=='Darwin':
            self.logs_path = os.path.expanduser(self.PATH_MAC)
        else:
            self.logs_path = os.path.expanduser(self.PATH_LINUX)
        self.logger.debug('Log path: %s' % self.logs_path)

        #members
        self.temp_dir = tempfile.gettempdir()

    def get_logs_path(self):
        """
        Return logs path (based on electron-log lib)

        Return:
            string: path to logs files
        """
        return self.logs_path

    def get_zipped_logs(self):
        """
        Return zipped archive that contains logs files

        Return:
            string: zipped archive path
        """
        #generate filename in tmp dir
        filename = os.path.join(self.temp_dir, str(uuid.uuid4()))

        #build archive
        try:
            archive = zipfile.ZipFile(filename, 'w')
            core_file = os.path.join(self.logs_path, self.LOGS_CORE)
            if os.path.exists(core_file):
                archive.write(core_file, basename(core_file))
            ui_file = os.path.join(self.logs_path, self.LOGS_UI)
            if os.path.exists(ui_file):
                archive.write(ui_file, basename(ui_file))
            archive.close()
        
        except:
            self.logger.exception('Unable to create logs archive:')
            return None

        return filename
    
if __name__=='__main__':
    logging.basicConfig(level=logging.DEBUG)
    import pprint

    pp = pprint.PrettyPrinter(indent=2)

    #TODO
