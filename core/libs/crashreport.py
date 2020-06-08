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
        """
        Constructor

        Args:
            product (string): product name
            prodcut_version (string): product version
            libs_version (dict): important libraries version
            debug (bool): debug flag
        """
        #logger
        self.logger = logging.getLogger(self.__class__.__name__)
        if debug:
            self.logger.setLevel(logging.DEBUG)
        else:
            self.logger.setLevel(logging.WARN)

        #members
        self.extra = libs_version
        self.enabled = False

        #fill metadata collection
        self.extra['platform'] = platform.platform()
        self.extra['product'] = product
        self.extra['product_version'] = product_version
        try:
            #append more metadata for raspberry
            import gpiozero
            info = gpiozero.pi_info()
            self.extra['raspberrypi_model'] = info.model
            self.extra['raspberrypi_revision'] = info.revision
            self.extra['raspberrypi_pcb_revision'] = info.pcb_revision
            self.extra['raspberrypi_memory'] = info.memory
            self.extra['raspberrypi_storage'] = info.storage
        except:
            self.logger.debug('Application is not running on a raspberry pi')
        
        #create and configure raven client
        Sentry.init('https://8e703f88899c42c18b8466c44b612472:3dfcd33abfda47c99768d43ce668d258@sentry.io/213385')
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
        This function is binded to system exception hook to be triggered automatically when uncatched exception occured
        /!\ Do not use this function in your code, prefer using report_exception() function instead of it.
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
        Set extra data to specified Sentry scope (typically )

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
