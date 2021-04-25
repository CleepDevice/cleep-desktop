#!/usr/bin/env python
# -*- coding: utf-8 -*

import logging
from core.utils import CleepDesktopModule
from core.libs.cleepdesktoplogs import CleepDesktopLogs

class Core(CleepDesktopModule):
    """
    Core module. Holds core functions
    """

    def __init__(self, context, debug_enabled):
        """
        Constructor

        Args:
            context (AppContext): application context
            debug_enabled (bool): True if debug is enabled
        """
        CleepDesktopModule.__init__(self, context, debug_enabled)

        self.logs = CleepDesktopLogs()

    def get_zipped_logs(self):
        """
        Zip and return logs
        """
        return self.logs.get_zipped_logs()
