#!/usr/bin/env python
# -*- coding: utf-8 -*

import logging
from threading import Thread
import time
import os
from zeroconf import ServiceBrowser, Zeroconf

class CleepDeviceInfos():
    """
    Cleep device infos gathers all useful properties from a device
    """

    def __init__(self):
        """
        Constructor
        """
        self.uuid = None
        self.hostname = None
        self.ip = None
        self.port = 0
        self.ssl = False

    def __str__(self):
        return u'%s [hostname=%s, ip=%s, port=%d, ssl=%s]' % (self.uuid, self.hostname, self.ip, self.port, self.ssl)


class ZeroconfListener(object):
    """
    Zeroconf listener
    """

    def __init__(self, callback_register, callback_unregister):
        """
        Constructor
        """
        self.logger = logging.getLogger(self.__class__.__name__)
        self.callback_register = callback_register
        self.callback_unregister = callback_unregister

    def get_device_infos(self, zeroconf, type, name):
        """
        Get infos from zeroconf

        Args:
            zeroconf: zeroconf object
            type: service type
            name: service name

        Return:
            CleepDeviceInfos
        """
        infos = CleepDeviceInfos()

        data = zeroconf.get_service_info(type, name)
        if data:
            #get infos from properties
            infos.ip = '.'.join(str(i) for i in data.address)
            infos.port = data.port

            self.logger.debug('Properties: %s' % data.properties)
            infos.uuid = data.properties.get(b'uuid', b'').decode('utf-8')
            infos.hostname = data.properties.get(b'hostname', b'').decode('utf-8')
            infos.ssl = data.properties.get(b'ssl', False)

        else:
            #no infos in properties, get at least device uuid from name
            infos.uuid = name.split('.')[0].replace('Cleep[', '').replace(']', '')

        return infos

    def remove_service(self, zeroconf, type, name):
        """
        Remove device that unregister
        """
        self.logger.debug('Remove service: %s' % name)
        if name.startswith('Cleep'):
            infos = self.get_device_infos(zeroconf, type, name)
            self.logger.info('Device unregistered %s' % str(infos))
            if self.callback_unregister:
                self.callback_unregister(infos)
        else:
            self.logger.debug('Drop not Cleep service')

    def add_service(self, zeroconf, type, name):
        """
        Add device that register
        """
        self.logger.debug('Add service: %s' % name)
        if name.startswith('Cleep'):
            infos = self.get_device_infos(zeroconf, type, name)
            self.logger.info('Device registered %s' % str(infos))
            if self.callback_register:
                self.callback_register(infos)
        else:
            self.logger.debug('Drop not Cleep service')


class Devices(Thread):
    """
    Devices manager: it allows auto device discovering
    """

    def __init__(self, update_callback):
        Thread.__init__(self)
        Thread.daemon = True

        #logger
        self.logger = logging.getLogger(self.__class__.__name__)
        #self.logger.setLevel(logging.DEBUG)

        #members
        self.running = True
        self.devices = []
        self.update_callback = update_callback

    def stop(self):
        """
        Stop process
        """
        self.running = False

    def run(self):
        """
        Start flash process. Does nothing until start_flash is called
        """
        self.running = True
        self.logger.debug('Devices thread started')

        #init zeroconf
        zeroconf = Zeroconf()
        listener = ZeroconfListener(self.__register_device, self.__unregister_device)
        browser = ServiceBrowser(zeroconf, '_http._tcp.local.', listener)

        #endless loop
        while self.running:
            time.sleep(.25)

        #cleanup
        zeroconf.close()
        self.logger.debug('Devices thread stopped')

    def __register_device(self, infos):
        """
        Register new device

        Args:
            infos (CleepDeviceInfos): device infos
        """
        #search for device
        found_device = None
        for device in self.devices:
            if device['uuid']==infos.uuid:
                found_device = device
                break

        if found_device is None:
            #add new entry if necessary
            self.logger.debug('Add device %s' % str(infos))
            self.devices.append({
                'uuid': infos.uuid,
                'hostname': infos.hostname,
                'ip': infos.ip,
                'port': infos.port,
                'ssl': infos.ssl,
                'online': True
            })
        else:
            #update entry
            self.logger.debug('Update device %s' % str(infos))
            found_device['hostname'] = infos.hostname
            found_device['ip'] = infos.ip
            found_device['port'] = infos.port
            found_device['ssl'] = infos.ssl
            found_device['online'] = True

        #update ui
        self.update_callback(self.get_devices())
            
    def __unregister_device(self, infos):
        """
        Unregister device

        Args:
            infos (CleepDeviceInfos): device infos
        """
        #search for device
        found_device = None
        for device in self.devices:
            if device['uuid']==infos.uuid:
                found_device = device
                break

        #offline entry
        if found_device is not None:
            self.logger.info('Device offline %s' % str(infos))
            found_device['online'] = False

        #update ui
        self.update_callback(self.get_devices())

    def get_devices(self):
        """
        Return discovered devices
        """
        #compute unconfigured devices
        #self.logger.debug(self.devices)
        unconfigured = len([dev for dev in self.devices if len(dev['hostname'])==0])

        return {
            'unconfigured': unconfigured,
            'devices': self.devices
        }

