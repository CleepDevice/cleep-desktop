#!/usr/bin/env python
# -*- coding: utf-8 -*

import logging
import os
import zipfile
import tempfile
import uuid
import platform


class CleepDesktopLogs:
    """
    Handle cleepdesktop logs files
    """

    LOGS_CORE = "cleepdesktopcore.log"
    LOGS_UI = "log.log"

    def __init__(self):
        """
        Constructor

        Args:
            logs_path (string): path of logs files
        """
        # logger
        self.logger = logging.getLogger(self.__class__.__name__)
        # self.logger.setLevel(logging.DEBUG)

        # build logs path according to platform
        # if platform.system() == "Windows":
        #     self.logs_path = os.path.expandvars(self.PATH_WIN)
        # elif platform.system() == "Darwin":
        #     self.logs_path = os.path.expanduser(self.PATH_MAC)
        # else:
        #     self.logs_path = os.path.expanduser(self.PATH_LINUX)
        # self.logger.debug("Log path: %s" % self.logs_path)

        # members
        self.temp_dir = tempfile.gettempdir()

    def get_logs_path(self):
        """
        Return logs path (based on electron-log lib)

        Return:
            string: path to logs files
        """
        return self.logs_path

    def get_zipped_logs(self, electron_log_path):
        """
        Return zipped archive that contains logs files

        Args:
            electron_log_path (str): electron logs path

        Return:
            string: zipped archive path
        """
        # generate filename in tmp dir
        filename = os.path.join(self.temp_dir, str(uuid.uuid4()) + ".zip")

        # build archive
        try:
            archive = zipfile.ZipFile(filename, "w")
            core_file = os.path.join(self.logs_path, self.LOGS_CORE)
            if os.path.exists(core_file):
                archive.write(core_file, os.path.basename(core_file))
            if os.path.exists(electron_log_path):
                archive.write(electron_log_path, os.path.basename(electron_log_path))
            archive.close()

        except Exception as error:
            self.logger.exception("Unable to create logs archive:")
            raise Exception("Error generating log zip") from error

        return filename
