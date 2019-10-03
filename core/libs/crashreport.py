#!/usr/bin/env python
# -*- coding: utf-8 -*

import logging
import sys
import sentry_sdk as Sentry
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
        self.extra = libs_version
        self.extra['platform'] = platform.platform()
        self.extra['product'] = product
        self.extra['product_version'] = product_version
        self.enabled = False

        #create and configure raven client
        Sentry.init('https://8e703f88899c42c18b8466c44b612472:3dfcd33abfda47c99768d43ce668d258@sentry.io213385')
        self.report_exception = self.__unbinded_report_exception
        sys.excepthook = self.crash_report

    def __unbinded_report_exception(self):
        """
        Unbinded report exception when sentry is disabled
        """
        pass

    def enable(self):
        """
        Enable crash report
        """
        self.logger.debug('Crash report is enabled')
        self.enabled = True

        #bind report_exception
        self.report_exception = Sentry.capture_exception

    def disable(self):
        """
        Disable crash report
        """
        self.logger.debug('Crash report is disabled')
        self.enabled = False

        #unbind report exception
        self.report_exception = self.__unbinded_report_exception

    def crash_report(self, type, value, tb):
        """
        Exception handler that report crashes
        """
        message = u'\n'.join(traceback.format_tb(tb))
        message += '\n%s %s' % (str(type), value)
        self.logger.fatal(message)
        if self.enabled:
            with Sentry.push_scope() as scope:
                self.__set_extra(scope)
                Sentry.capture_exception((type, value, tb))

    def __set_extra(self, scope):
        """
        Set extra data to specified Sentry scope

        Args:
            scope: Sentry scope
        """
        for key, value in self.extra.items():
            scope.set_extra(key, value)

if __name__ == '__main__':
    logging.basicConfig(level=logging.DEBUG, format='%(asctime)s %(name)s.%(funcName)s +%(lineno)s: %(levelname)-8s [%(process)d] %(message)s')

    #test crash report
    cr = CrashReport('Test', '0.0.0')
    #cr.disable()
    cr.enable()

    #test local catched exception
    try:
        raise Exception('My custom execption')
    except ZeroDivisionError:
        cr.report_exception()
        pass

    #try main exception
    1/0

    print('Done')
