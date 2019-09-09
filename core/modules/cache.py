#!/usr/bin/env python
# -*- coding: utf-8 -*

import logging
from core.utils import CleepDesktopModule
from core.libs.download import Download

class Cache(CleepDesktopModule):
    """
    Cache module. Holds cache functions
    """

    def __init__(self, context, debug_enabled):
        """
        Constructor

        Args:
            context (AppContext): application context
            debug_enabled (bool): True if debug is enabled
        """
        CleepDesktopModule.__init__(self, context, debug_enabled)

    def get_cached_files(self):
        """
        Returns cached files

        Returns:
            list: list of cached files
        """
        dl = Download(self.context.paths.cache)

        return dl.get_cached_files()

    def delete_cached_file(self, filename):
        """
        Delete specified cached file

        Args:
            filename (string): file path

        Returns:
            list: list of cached files
        """
        dl = Download(self.context.paths.cache)
        dl.delete_cached_file(filename)

        return dl.get_cached_files()

    def purge_cached_files(self):
        """
        Purge all cached files

        Returns:
            list: list of cached files
        """
        dl = Download(self.context.paths.cache)
        dl.purge_files(force_all=True)

        return  dl.get_cached_files()
