#!/usr/bin/env python
# -*- coding: utf-8 -*

import logging
import sys
from raven import Client
import platform
import traceback

class CrashReport():
    """
    Crash report class
    """

    def __init__(self, product, product_version, libs_version={}, debug=False):
        #logger
        self.logger = logging.getLogger(self.__class__.__name__)
        if debug:
            self.logger.setLevel(logging.DEBUG)
        else:
            self.logger.setLevel(logging.WARN)

        #members
        self.enabled = False
        self.client = Client('https://8e703f88899c42c18b8466c44b612472:3dfcd33abfda47c99768d43ce668d258@sentry.io/213385')
        user_context = libs_version
        user_context['platform'] = platform.platform()
        user_context['product'] = product
        user_context['product_version'] = product_version
        self.client.user_context(user_context)

        #bind
        self.report_exception = self.client.captureException

        #attach exception hook
        sys.excepthook = self.crash_report

    #def report_exception(self):
    #    function is directly connected to Raven client instance

    def enable(self):
        """
        Enable crash report
        """
        self.logger.debug('Crash report is enabled')
        self.enabled = True

    def disable(self):
        """
        Disable crash report
        """
        self.logger.debug('Crash report is disabled')
        self.enabled = False

    def crash_report(self, type, value, tb):
        """
        Exception handler that report crashes
        """
        message = u'\n'.join(traceback.format_tb(tb))
        message += '\n%s %s' % (str(type), value)
        self.logger.fatal(message)
        if self.enabled:
            self.client.captureException((type, value, tb))


if __name__ == '__main__':
    logging.basicConfig(level=logging.DEBUG, format='%(asctime)s %(name)s.%(funcName)s +%(lineno)s: %(levelname)-8s [%(process)d] %(message)s')

    #test crash report
    cr = CrashReport('Test', '0.0.0')
    #cr.disable()
    cr.enable()

    #test lcoal catched exception
    try:
        raise Exception('My custom execption')
    except ZeroDivisionError:
        cr.report_exception()
        pass

    #try main exception
    1/0

    print('Done')
