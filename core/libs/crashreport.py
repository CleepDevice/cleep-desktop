#!/usr/bin/env python
# -*- coding: utf-8 -*

import logging
import sys
from sentry_sdk import init as SentryInit
from sentry_sdk import push_scope as SentryPushScope
from sentry_sdk import capture_message as SentryCaptureMessage
from sentry_sdk import capture_exception as SentryCaptureException
from sentry_sdk import configure_scope
import platform
import traceback
import copy

class CrashReport():
    """
    Crash report class
    """

    def __init__(self, token, product, product_version, libs_version={}, debug=False, disabled_by_core=False):
        """
        Constructor

        Args:
            token (string): crash report service token (like sentry dsn)
            product (string): product name
            product_version (string): product version
            libs_version (dict): important libraries versions
            debug (bool): debug flag
            disabled_by_core (bool): used by core to force crash report deactivation
        """
        # logger
        self.logger = logging.getLogger(self.__class__.__name__)
        if debug:
            self.logger.setLevel(logging.DEBUG)
        else:
            self.logger.setLevel(logging.WARN)

        # members
        self.__disabled_by_core = disabled_by_core
        self.__enabled = False
        self.__token = token
        self.__libs_version = libs_version
        self.__product = product
        self.__product_version = product_version

        # disable crash report if necessary
        if self.__disabled_by_core or not token:
            self.logger.debug('Crash report forced to be disabled')
            self.disable()

        # create and configure raven client
        SentryInit(
            dsn=self.__token,
            release=product_version,
            attach_stacktrace=True,
            before_send=self.__filter_exception,
            default_integrations=False
        )

        # fill current scope
        with configure_scope() as scope:
            scope.set_tag('platform', platform.platform())
            scope.set_tag('product', product)
            scope.set_tag('product_version', product_version)
            for key, value in libs_version.items():
                scope.set_tag(key, value)
            try:
                # append more metadata for raspberry
                import core.libs.tools as Tools
                infos = Tools.raspberry_pi_infos()
                scope.set_tag('raspberrypi_model', infos[u'model'])
                scope.set_tag('raspberrypi_revision', infos[u'revision'])
                scope.set_tag('raspberrypi_pcbrevision', infos[u'pcbrevision'])
            except Exception as e: # pragma: no cover
                self.logger.debug('Application is not running on a raspberry pi: %s' % str(e))
        

    def __filter_exception(self, event, hint): # pragma: no cover
        """
        Callback used to filter sent exception
        """
        if 'exc_info' in hint:
            _, exc_value, _ = hint["exc_info"]
            if type(exc_value).__name__ in (u'KeyboardInterrupt', u'zmq.error.ZMQError', u'AssertionError', u'ForcedException', u'NotReady'):
                self.logger.debug('Exception "%s" filtered' % type(exc_value).__name__)
                return None

        return event

    def is_enabled(self):
        """
        Returns True if crash report is enabled

        Returns:
            bool: True if enabled
        """
        return self.__enabled

    def enable(self):
        """
        Enable crash report
        """
        self.logger.debug('Crash report is enabled')
        self.__enabled = True

    def disable(self):
        """
        Disable crash report
        """
        self.logger.debug('Crash report is disabled')
        self.__enabled = False

    def report_exception(self, extra=None):
        """
        Exception handler that report crashes. It automatically include stack trace

        Args:
            extra (dict): extra metadata to post with the report
        """
        if self.__enabled:
            self.logger.debug('Send crash report')
            with SentryPushScope() as scope:
                self.__set_extra(scope, extra)
                SentryCaptureException()

    def manual_report(self, message, extra=None):
        """
        Report manually a crash report dumping current stack trace to report error

        Args:
            message (string): message to attach to crash report
            extra (dict): extra metadata to post with the report
        """
        if self.__enabled:
            self.logger.debug('Send manual report')
            with SentryPushScope() as scope:
                self.__set_extra(scope, extra)
                SentryCaptureMessage(message)

    def __set_extra(self, scope, more_extra={}):
        """
        Set extra data to specified Sentry scope (typically )

        Args:
            scope: Sentry scope
        """
        if isinstance(more_extra, dict) and more_extra:
            for key, value in more_extra.items():
                scope.set_extra(key, value)

    def get_infos(self):
        """
        Return infos from crash report instance

        Returns:
            dict: crash report infos::

                {
                    libsversion (dict): libs version (lib: version),
                    product (string): product name,
                    productversion (string): product version
                }

        """
        return {
            'libsversion': copy.deepcopy(self.__libs_version),
            'product': self.__product,
            'productversion': self.__product_version,
        }

    def add_module_version(self, module_name, module_version):
        """
        Add module version to libs version

        Args:
            module_name (string): module name
            module_version (string): module version
        """
        self.__libs_version[module_name.lower()] = module_version
        with configure_scope() as scope:
            scope.set_tag(module_name, module_version)
