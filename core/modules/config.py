#!/usr/bin/env python
# -*- coding: utf-8 -*

import logging
from functools import reduce
from core.utils import CleepDesktopModule

class Config(CleepDesktopModule):
    """
    Config module. Handles application configuration
    """

    def __init__(self, context, app_config, debug_enabled):
        """
        Constructor

        Args:
            context (AppContext): application context
            app_config (AppConfig): application config instance
            debug_enabled (bool): True if debug is enabled
        """
        CleepDesktopModule.__init__(self, context, debug_enabled)

        #members
        self.app_config = app_config

    def set_config_value(self, key, value):
        """
        Save specified value on specified key

        Args:
            key (string): key to update. Can be a deep key like xxx.yyy.zzz

        Returns:
            bool: True if value updated
        """
        def walk(node, keys, value):
            key = keys.pop(0)
            if len(keys)==0:
                #leaf, update value
                if key in node.keys():
                    node[key] = value
                    return True
                else:
                    #self.context.main_logger.debug('Key "%s" not found' % key)
                    return False
            elif key in node.keys():
                return walk(node[key], keys, value)
            else:
                #self.context.main_logger.debug('Key "%s" not found' % key)
                return False

        config = self.app_config.load_config()
        if walk(config, key.split('.'), value):
            return self.set_config(config)

        return False

    def set_config(self, config):
        """
        Save config file.

        Args:
            config (dict): config to save.

        Returns:
            bool: True if file successfully saved, False otherwise
        """
        old = self.app_config.load_config()

        #process debug flag
        if old['cleep']['debug']!=config['cleep']['debug']:
            if config['cleep']['debug']:
                self.context.main_logger.setLevel(True)
                for _, module in self.context.modules.items():
                    module.set_debug(True)
            else:
                self.context.main_logger.setLevel(False)
                for _, module in self.context.modules.items():
                    module.set_debug(False)
                
        #process crashreport flag
        if old['cleep']['crashreport']!=config['cleep']['crashreport']:
            if config['cleep']['crashreport']:
                self.crash_report.enable()
            else:
                self.crash_report.disable()

        return self.app_config.save_config(config)

    def get_config_value(self, key):
        """
        Return config value for specified key

        Args:
            key (string): config key. Can be deep key like xxx.yyy.zzz

        Returns:
            any: config key value
        """
        config = self.app_config.load_config()

        return self.__deep_get(config, key)

    def get_config(self):
        """
        Returns config

        Returns:
            dict: config file content
        """
        return {
            'config': self.app_config.load_config(),
            'logs': self.context.log_filepath,
            'cachedir': self.context.paths.cache,
        }

    def __deep_get(self, dictionary, keys, default=None):
        """
        Deep dict value get with complex key "part1.part2.part3"

        Note:
            https://stackoverflow.com/a/46890853

        Args:
            dictionnary: dict to search onto
            keys (string): key (x.x.x)
            default (any): default value when nothing found

        Returns:
            any: value or default if not found
        """
        return reduce(lambda d, key: d.get(key, default) if isinstance(d, dict) else default, keys.split("."), dictionary)
