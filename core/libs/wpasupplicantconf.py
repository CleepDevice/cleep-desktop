#!/usr/bin/env python
# -*- coding: utf-8 -*-

from core.exception import InvalidParameter, MissingParameter, CommandError
from core.libs.config import Config
from core.libs.console import Console
import logging
import os
import re
import io
import time

class WpaSupplicantConf(Config):
    """
    Helper class to update and read /etc/wpa_supplicant/wpa_supplicant.conf file

    Warning:
        This class is not thread safe due to self.CONF that can be modified on the fly

    Note:
        https://w1.fi/cgit/hostap/plain/wpa_supplicant/wpa_supplicant.conf
    """

    DEFAULT_CONF = '/etc/wpa_supplicant/wpa_supplicant.conf'
    CONF = DEFAULT_CONF
    WPASUPPLICANT_DIR = '/etc/wpa_supplicant'

    ENCRYPTION_TYPE_WPA = 'wpa'
    ENCRYPTION_TYPE_WPA2 = 'wpa2'
    ENCRYPTION_TYPE_WEP = 'wep'
    ENCRYPTION_TYPE_UNSECURED = 'unsecured'
    ENCRYPTION_TYPE_UNKNOWN = 'unknown'
    ENCRYPTION_TYPES = [
        ENCRYPTION_TYPE_WPA,
        ENCRYPTION_TYPE_WPA2,
        ENCRYPTION_TYPE_WEP,
        ENCRYPTION_TYPE_UNSECURED,
        ENCRYPTION_TYPE_UNKNOWN
    ]

    COUNTRIES_ISO3166 = '/usr/share/zoneinfo/iso3166.tab'

    DEFAULT_CONTENT = 'ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev\nupdate_config=1\n'

    def __init__(self, cleep_filesystem, backup=True):
        """
        Constructor

        Args:
            cleep_filesystem (CleepFilesystem): CleepFilesystem instance
            backup (bool): backup file
        """
        # config file may vary that's why None is specified as config filepath in constructor
        Config.__init__(self, cleep_filesystem, None, None, backup)

        # logger
        self.logger = logging.getLogger(self.__class__.__name__)
        # self.logger.setLevel(logging.DEBUG)

        # members
        self.cleep_filesystem = cleep_filesystem
        self.__groups = {}
        self.__country_codes = None

    def __restore_conf(self):
        """
        Restore conf to default file
        """
        self.CONF = WpaSupplicantConf.DEFAULT_CONF

    def __load_country_codes(self):
        """
        Load country codes based on local files
        """
        self.logger.trace('Opening countries file "%s"' % self.COUNTRIES_ISO3166)
        if os.path.exists(self.COUNTRIES_ISO3166):
            lines = self.cleep_filesystem.read_data(self.COUNTRIES_ISO3166)
            self.logger.trace('COUNTRIES_ISO3166 contains %s lines' % len(lines))

            if not lines:
                self.logger.error('Unable to get countries, countries file "%s" is empty')
                self.__country_codes = {}
                return

            self.__country_codes = {}
            for line in lines:
                if line.startswith('#'):
                    continue
                (code, country) = line.split(None, 1)
                self.__country_codes[country.strip().lower()] = code

        else:
            # no iso3166 file, set to empty dict
            self.logger.warning('Unable to get countries, countries file "%s" was not found' % self.COUNTRIES_ISO3166)
            self.__country_codes = {}

        self.logger.trace('Found country codes: %s' % self.__country_codes)

    def save_default_config(self, interface=None):
        """
        Save default wpa_supplicant_<interface>.conf for specified interface. If no interface specified, default file
        wpa_supplicant.conf will be generated.

        Args:
            interface (string): interface name. If not specified use default wpa_supplicant.conf file.

        Returns:
            bool: True if config file written successfully
        """
        interface_prefix = '-%s' % interface if interface else ''
        path = os.path.join(WpaSupplicantConf.WPASUPPLICANT_DIR, 'wpa_supplicant%s.conf' % interface_prefix)
        self.logger.info('Create default wpa_supplicant config "%s" for interface "%s"' % (path, interface))

        return self.cleep_filesystem.write_data(path, WpaSupplicantConf.DEFAULT_CONTENT)

    def has_config(self, interface=None):
        """
        Check if specified interface has config

        Args:
            interface (string): interface name. If not specified check default wpa_supplicant.conf file.

        Returns:
            bool: True if wpa supplicant config file exists
        """
        interface_prefix = '-%s' % interface if interface else ''
        path = os.path.join(WpaSupplicantConf.WPASUPPLICANT_DIR, 'wpa_supplicant%s.conf' % interface_prefix)

        return os.path.exists(path)

    def has_country(self, interface=None):
        """
        Return True if wpa_supplication conf file contains country info

        Args:
            interface (string): interface name. If not specified check default wpa_supplicant.conf file.

        Returns:
            bool: True if country is configured
        """
        configs = self.__get_configuration_files()
        if interface is None:
            interface = 'default'
        if interface not in configs:
            return False

        content = self.cleep_filesystem.read_data(configs[interface])
        return ''.join(content).find('country') >= 0

    def set_country(self, country):
        """
        Configure country in all wpa_supplicant conf files

        Args:
            country (string): country name to set

        Raises:
            Exception if country code is invalid
        """
        # load country codes
        if self.__country_codes is None:
            self.__load_country_codes()

        # get country code
        country_lower = country.lower()
        if country_lower not in self.__country_codes:
            self.logger.error('Country "%s" not found in country codes' % country_lower)
            raise Exception('Invalid country code "%s" specified' % country)
        country_code = self.__country_codes[country_lower]
        self.logger.debug('Found country code "%s" for country "%s"' % (country_code, country))

        self.set_country_alpha2(country_code)

    def set_country_alpha2(self, alpha2):
        """
        Configure country in all wpa_supplicant conf files.

        Note:
            This is the preferred method compare to set_country function because alpha2 codes are normalized by
            iso3166-1 while country label not. Using set_country could raises an exception if your specified
            country does not exactly match the correct value.

        Args:
            alpha2 (string): country alpha2 code

        Raises:
            Exception if country code is invalid
        """
        # load country codes
        if self.__country_codes is None:
            self.__load_country_codes()

        # check alpha2 existence
        if alpha2 not in self.__country_codes.values():
            raise Exception('Invalid country code "%s" specified' % alpha2)
        
        # update wpa_supplicant files
        config_files = self.__get_configuration_files()
        # workaround to handle different configuration files in the same Config instance
        for interface in config_files:
            self.CONF = config_files[interface]
            if self.replace_line('^\s*country\s*=.*$', 'country=%s' % alpha2):
                self.logger.info('Country code "%s" updated in "%s" file' % (alpha2, self.CONF))
            elif self.add_lines(['country=%s\n' % alpha2], end=False):
                self.logger.info('Country code "%s" added in "%s" file' % (alpha2, self.CONF))
            else: # pragma: no cover
                self.logger.warning('Unable to set country code in wpasupplicant file "%s"' % self.CONF)
        self.__restore_conf()

    def encrypt_password(self, network, password):
        """
        Encrypt specified password using wpa_passphrase

        Args:
            network (string): network name
            password (string): password to encrypt

        Returns:
            string: encrypted password
        """
        lines = self.wpa_passphrase(network, password)

        for line in lines:
            line = line.strip()
            if line.startswith('psk='):
                return line.replace('psk=', '')

        self.logger.error('No password generated by wpa_passphrase: %s' % lines)
        raise Exception('No password generated by wpa_passphrase command')

    def wpa_passphrase(self, network, password):
        """
        Execute wpa_passphrase command and return output

        Args:
            network (string): network name
            password (string): password

        Returns:
            list: wpa_passphrase output without password in clear
        """
        if network is None or len(network) == 0:
            raise MissingParameter('Parameter "network" is missing')
        if password is None or len(password) == 0:
            raise MissingParameter('Parameter "password" is missing')
        if len(password)<8 or len(password)>63:
            raise InvalidParameter('Parameter "password" must be 8..63 string length')

        c = Console()
        res = c.command('/usr/bin/wpa_passphrase "%s" "%s"' % (network, password))
        if res['error'] or res['killed']:
            self.logger.error('Error with wpa_passphrase: %s' % ''.join(res['stderr']))
            raise Exception('Error with wpa_passphrase: unable to encrypt it')
        if not ''.join(res['stdout']).startswith('network'):
            self.logger.error('Error with wpa_passphrase: %s' % ''.join(res['stdout']))
            raise Exception('Error with wpa_passphrase: invalid command output')
        output = [line+'\n' for line in res['stdout'] if line.find('#psk=') < 0]

        return output

    def __get_configuration_files(self):
        """
        Scan /etc/wpa_supplicant directory to find interface specific confguration

        Returns:
            dict: interface and configuration file::

                {
                    interface(string): config path (string),
                    ...
                }

        """
        configs = {}

        self.logger.debug('Scan "%s" for wpa_supplicant config files' % self.WPASUPPLICANT_DIR)
        for f in os.listdir(self.WPASUPPLICANT_DIR):
            try:
                fpath = os.path.join(self.WPASUPPLICANT_DIR, f)
                (conf, ext) = os.path.splitext(f)
                if os.path.isfile(fpath) and conf == 'wpa_supplicant':
                    # default config file
                    configs['default'] = fpath

                elif os.path.isfile(fpath) and ext == '.conf' and conf.startswith('wpa_supplicant-'):
                    # get interface
                    interface = conf.split('-', 1)[1]
                    configs[interface] = fpath

            except: # pragma: no cover
                self.logger.exception('Exception occured during wpa_supplicant config file search:')

        self.logger.debug('Found wpa_supplicant config files: %s' % configs)
        return configs

    def __get_configuration(self, config, interface):
        """
        Return networks found in conf file

        Args:
            config (string): config filepath to parse
            interface (string): interface that refers to specified file (used to store data)

        Returns:
            dict: list of wireless configurations::

                {
                    network name (string): {
                        group (string): full search result,
                        network (string): network name,
                        password (string): password,
                        hidden (bool): True if network is hidden,
                        encryption (string): encryption type (see ENCRYPTION_TYPE_XXX),
                        disabled (string): True if network is disabled
                    }
                }

        """
        networks = {}
        entries = []

        # force specified config file
        self.logger.debug('Read configuration of "%s" for interface "%s"' % (config, interface))
        self.CONF = config

        # parse network={} block:  {((?:[^{}]|(?R))*)}
        # parse inside network block:  \s+(.*?)=(.*?)\s*\R
        results = self.find(r'network\s*=\s*\{\s*(.*?)\s*\}', re.UNICODE | re.DOTALL)
        for group, groups in results:
            # filter none values
            groups = list(filter(None, groups))

            # create new entry
            current_entry = {
                'group': group, #DO NOT REMOVE IT, field is removed at end of this function
                'network': None,
                'password': None,
                'hidden': False,
                'encryption': self.ENCRYPTION_TYPE_WPA2, # default encryption to WPA2 even if not specified in wpa_supplicant.conf file
                'disabled': False
            }
            entries.append(current_entry)

            # fill entry
            pattern = r'^\s*(\w+)=(.*?)\s*$'
            for content in groups:
                sub_results = self.find_in_string(pattern, content, re.UNICODE | re.MULTILINE)
                
                # filter none values
                for sub_group, sub_groups in sub_results:
                    if len(sub_groups) == 2:
                        if sub_groups[0].startswith('ssid'):
                            current_entry['network'] = sub_groups[1].replace('"','').replace('\'','')
                        elif sub_groups[0].startswith('scan_ssid'):
                            if sub_groups[1] is not None and sub_groups[1].isdigit() and sub_groups[1] == '1':
                                current_entry['hidden'] = True
                        elif sub_groups[0].startswith('key_mgmt'):
                            if sub_groups[1] == 'WPA-PSK':
                                current_entry['encryption'] = self.ENCRYPTION_TYPE_WPA2
                            elif sub_groups[1] == 'NONE':
                                current_entry['encryption'] = self.ENCRYPTION_TYPE_WEP
                        elif sub_groups[0].startswith('psk'):
                            current_entry['password'] = sub_groups[1].replace('"','').replace('\'','')
                        elif sub_groups[0].startswith('wep_key0'):
                            current_entry['password'] = sub_groups[1].replace('"','').replace('\'','')
                        elif sub_groups[0].startswith('disabled') and sub_groups[1] == '1':
                            current_entry['disabled'] = True

                    else: # pragma: no cover
                        # invalid content, drop this item
                        continue

        # clean entry
        if interface not in self.__groups:
            self.__groups[interface] = {}
        for entry in entries:
            self.__groups[interface][entry['network']] = entry['group']
            del entry['group']
            networks[entry['network']] = entry

        self.__restore_conf()

        return networks

    def get_configurations(self):
        """
        Get all configuration files

        Returns:
            dict: dict of configurations per interface. If there is no specific config file, interface is named "default"::

            {
                interface name (string) or 'default': {
                    network name (string): {
                        network (string): network name,
                        password (string): password,
                        hidden (bool): True if network is hidden,
                        encryption (string): encryption type (see ENCRYPTION_TYPE_XXX),
                        disabled (string): True if network is disabled
                    },
                    ...
                },
                ...
            }

        """
        # init
        configs = {}

        # get configuration files
        config_files = self.__get_configuration_files()

        # get configurations
        if len(config_files) == 0:
            self.logger.warning('No wpa_supplicant config file found')

        else:
            # parse all configuration files
            for interface in config_files:
                configs[interface] = self.__get_configuration(config_files[interface], interface)
        
        return configs

    def get_configuration(self, network, interface=None):
        """
        Get network config

        Args:
            network (string): network name
            interface (string): interface name. If not specified return config from default wpa_supplicant.conf file

        Returns:
            dict: network config, None if network is not found::

                {
                    network (string): network name,
                    encryption (string): encryption type (see ENCRYPTION_TYPE_XXX),
                    password (string): password,
                    hidden (bool): True if network is hidden,
                    disabled (string): True if network is disabled
                }

        """
        # get configurations
        configurations = self.get_configurations()
        self.logger.trace('Configurations: %s' % configurations)

        # get configuration of specified interface
        if interface:
            if interface not in configurations:
                return None
            elif network not in configurations[interface]:
                return None
            else:
                return configurations[interface][network]

        else:
            if 'default' not in configurations:
                return None
            elif network not in configurations['default']:
                return None
            else:
                return configurations['default'][network]

    def delete_network(self, network, interface=None):
        """
        Delete network from config

        Args:
            network (string): network name
            interface (string|None): if specified try to add network in specific interface wpa_supplicant.conf file

        Returns:
            bool: True if network deleted, False otherwise
        """
        # check params
        if network is None or len(network) == 0:
            raise MissingParameter('Parameter "network" is missing')

        # check if network exists
        configuration = self.get_configuration(network, interface)
        self.logger.debug('Found configuration: %s' % configuration)
        if configuration is None:
            return False

        # get configurations files
        config_files = self.__get_configuration_files()

        # remove network config
        if interface:
            self.CONF = config_files[interface]
            removed = self.remove(self.__groups[interface][configuration['network']])
        else:
            self.CONF = config_files['default']
            removed = self.remove(self.__groups['default'][configuration['network']])

        self.__restore_conf()
        return removed

    def __add_network(self, config, interface=None):
        """
        Add new entry based on configuration

        Args:
            config (dict): configuration dict (see get_configuration)
            interface (string|None): if specified try to add network in specific interface wpa_supplicant.conf file

        Returns:
            bool: True if network added
        """
        content = [
            '\nnetwork={\n',
            '\tssid="%s"\n' % config['network']
        ]

        # encryption
        if config['encryption'] in [self.ENCRYPTION_TYPE_WPA, self.ENCRYPTION_TYPE_WPA2]:
            # WPA/WPA2 security
            content.append('\tkey_mgmt=WPA-PSK\n')
            content.append('\tpsk=%s\n' % config['password'])
        elif config['encryption'] == self.ENCRYPTION_TYPE_WEP:
            # WEP security
            content.append('\tkey_mgmt=NONE\n')
            content.append('\twep_key0=%s\n' % config['password'])
            content.append('\twep_tx_keyidx=0\n')
        else:
            # unsecured network
            content.append('\tkey_mgmt=NONE\n')

        # hidden network
        if config['hidden']:
            content.append('\tscan_ssid=1\n')

        # disabled network
        if config['disabled']:
            content.append('\tdisabled=1\n')

        content.append('}\n')

        self.logger.debug('Config to append %s' % content)
        return self.add_lines(content)

    def add_network(self, network, encryption, password, hidden=False, interface=None, encrypt_password=True):
        """
        Add new network in config file
        Password is automatically encrypted using wpa_passphrase
        
        Args:
            network (string): network name (ssid)
            encryption (string): network encryption (wpa|wpa2|wep|unsecured)
            password (string): network password (not encrypted!)
            hidden (bool): hidden network flag
            interface (string|None): if specified try to add network in specific interface wpa_supplicant.conf file
            encrypt_password (bool): encrypt password if necessary before adding it to config file (default True)

        Returns:
            bool: True if network successfully added

        Raises:
            MissingParameter, InvalidParameter
        """
        # check params
        if network is None or len(network) == 0:
            raise MissingParameter('Parameter "network" is missing')
        if encryption is None or len(encryption) == 0:
            raise MissingParameter('Parameter "encryption" is missing')
        if encryption not in self.ENCRYPTION_TYPES:
            raise InvalidParameter('Parameter "encryption" is invalid (available: %s)' % (','.join(self.ENCRYPTION_TYPES)))
        if encryption != self.ENCRYPTION_TYPE_UNSECURED and (password is None or len(password) == 0):
            raise MissingParameter('Parameter "password" is missing')

        # check if network doesn't already exist
        if self.get_configuration(network, interface) is not None:
            raise InvalidParameter('Network "%s" is already configured' % network)

        # make sure config file exists for interface
        if not self.has_config(interface):
            self.save_default_config(interface)
    
        # switch configuration file
        configurations = self.__get_configuration_files()
        if interface:
            self.CONF = configurations[interface]
        else:
            self.CONF = configurations['default']

        # encrypt password if necessary
        if encrypt_password and encryption in [self.ENCRYPTION_TYPE_WPA, self.ENCRYPTION_TYPE_WPA2]:
            password = self.encrypt_password(network, password)

        # write new network config
        added = self.__add_network({
            'network': network,
            'encryption': encryption,
            'password': password,
            'hidden': hidden,
            'disabled': False,
        }, interface)
    
        self.__restore_conf()
        return added

    def update_network_password(self, network, password, interface=None):
        """
        Update specified network password

        Args:
            network (string): network name (ssid)
            password (string): network password
            interface (string|None): if specified try to add network in specific interface wpa_supplicant.conf file

        Returns:
            bool: True if network password updated

        Raises:
            MissingParameter
        """
        # check params
        if network is None or len(network) == 0:
            raise MissingParameter('Parameter "network" is missing')
        if password is None or len(password) == 0:
            raise MissingParameter('Parameter "password" is missing')

        # first of all get network configuration
        config = self.get_configuration(network, interface)
        if config is None:
            raise InvalidParameter('Network "%s" is not configured' % network)

        # encrypt password if necessary
        if config['encryption'] == self.ENCRYPTION_TYPE_UNSECURED:
            self.logger.info('No need to update password on unsecured network')
            return False
        if config['encryption'] in (self.ENCRYPTION_TYPE_WPA2, self.ENCRYPTION_TYPE_WPA):
            config['password'] = self.encrypt_password(network, password)
            self.logger.debug('Encrypt password %s: %s' % (password, config['password']))
        else:
            config['password'] = password

        # switch configuration file
        configurations = self.__get_configuration_files()
        if interface:
            self.CONF = configurations[interface]
        else:
            self.CONF = configurations['default']

        # delete existing entry
        updated = False
        if self.delete_network(network, interface):
            self.logger.debug('Config deleted')
            # and add new updated entry
            updated = self.__add_network(config, interface)

        self.__restore_conf()
        return updated

    def __update_network_disabled_flag(self, network, disabled, interface=None):
        """
        Update specified network disabled flag

        Args:
            network (string): network name (ssid)
            disabled (bool): disabled flag
            interface (string|None): if specified try to add network in specific interface wpa_supplicant.conf file

        Returns:
            bool: True if network flag updated
        """
        # check params
        if network is None or len(network) == 0:
            raise MissingParameter('Parameter "network" is missing')
        if not isinstance(disabled, bool):
            raise InvalidParameter('Parameter "disabled" is invalid')

        # first of all get network configuration
        config = self.get_configuration(network, interface)
        if config is None:
            return False

        # update disabled flag
        config['disabled'] = disabled

        # delete existing entry
        if self.delete_network(network, interface):
            # and add new updated entry
            return self.__add_network(config, interface)

        return False

    def enable_network(self, network, interface=None):
        """
        Enable network

        Args:
            network (string): network name
            interface (string|None): if specified try to add network in specific interface wpa_supplicant.conf file

        Returns:
            bool: True if network enabled

        Raises:
            MissingParameter
        """
        return self.__update_network_disabled_flag(network, False, interface=interface)

    def disable_network(self, network, interface=None):
        """
        Disable network

        Args:
            network (string): network name
            interface (string|None): if specified try to add network in specific interface wpa_supplicant.conf file

        Returns:
            bool: True if network disabled

        Raises:
            MissingParameter
        """
        return self.__update_network_disabled_flag(network, True, interface=interface)
