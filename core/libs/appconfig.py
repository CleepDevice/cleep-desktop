#!/usr/bin/env python
# -*- coding: utf-8 -*-

import logging
import json
import os
from threading import Lock


class AppConfig:
    """
    Handle application configuration file.
    The file is handled by electron app for creation and check (in cleepdesktop.js => checkConfig())
    This class only allow you to update or get existing values.
    """

    def __init__(self, filepath):
        """
        Constructor

        Args:
            filepath (string): config file path
        """
        # members
        self.logger = logging.getLogger(self.__class__.__name__)
        self.logger.setLevel(logging.DEBUG)
        self.filepath = filepath
        self.__lock = Lock()
        self.__config = {}

    def save_config(self, config):
        """
        Save config file.

        Args:
            config (dict): config to save.

        Returns:
            bool: True if file successfully saved, False otherwise
        """
        force_reload = False
        out = False

        # check if module have config file
        if not self.filepath:
            raise Exception("Config filepath not set. Unable to save configuration")

        self.__lock.acquire(True)
        try:
            f = open(self.filepath, "w")
            f.write(json.dumps(config))
            f.close()
            force_reload = True
            out = True
        except:
            self.logger.exception("Unable to write config file %s:" % self.filepath)
        self.__lock.release()

        if force_reload:
            # reload config
            self.__load_config()

        return out

    def __load_config(self):
        """
        Load config file internally
        """
        # check if module have config file
        if not self.filepath:
            raise Exception("Config filepath not set. Unable to load configuration")

        self.__lock.acquire(True)
        try:
            self.logger.debug("Loading conf file %s" % self.filepath)
            if os.path.exists(self.filepath):
                f = open(self.filepath, "r")
                raw = f.read()
                f.close()
                self.__config = json.loads(raw)
            else:
                # no conf file yet
                self.logger.warning('No config file found at "%s"' % self.filepath)
        except:
            self.logger.exception("Unable to load config file %s:" % self.filepath)
        self.__lock.release()

    def load_config(self):
        """
        Returns config

        Returns:
            dict: config file content
        """
        if not self.__config:
            self.__load_config()

        return self.__config

    def get_config(self):
        """
        Shortcut to load_config
        """
        return self.load_config()
