#!/usr/bin/env python
# -*- coding: utf-8 -*-

from core.libs.config import Config
import core.libs.converters as converters
import os
import json
import logging

class CleepWifiConf(Config):
    """
    Helper class to read and write cleepwifi.conf
    """

    CONF = u'/boot/cleepwifi.conf'

    def __init__(self):
        """
        Constructor
        """
        Config.__init__(self, self.CONF, u'', False)

        #members
        self.logger = logging.getLogger(self.__class__.__name__)

    def get_configuration(self):
        """
        Return cleepwifi configuration

        Return:
            dict: configuration or None if error::
                {
                    network (string)
                    password (string)
                    encryption (wep|wpa|wpa2|unsecured)
                    hidden (bool)
                }
        """
        try:
            content = self.get_content()[0]
            return json.loads(content)
        except:
            self.logger.exception(u'Unable to load %s:' % self.CONF)

        return None

    def create_content(self, network, password, encryption, hidden):
        """
        Generate cleepwifi.conf file content to awaited format. Encrypt password if necessary (wpa, wpa2)

        Args:
            network (string): network name
            password (string): network password
            encryption (string): network encryption (wep|wpa|wpa2|unsecured)
            hidden (bool): connect to hidden network

        Return:
            string: cleepwifi.conf file content
        """
        #encrypt password
        if encryption in ('wpa', 'wpa2'):
            password = converters.wpa_passphrase(network, password)
        
        config = {
            u'network': network,
            u'password': password,
            u'encryption': encryption,
            u'hidden': hidden
        }

        return json.dumps(config)
