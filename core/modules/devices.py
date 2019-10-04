#!/usr/bin/env python
# -*- coding: utf-8 -*

import logging
import os
import json
import time
from core.version import version as VERSION
from core.utils import CleepDesktopModule
from core.libs.externalbus import PyreBus

class Devices(CleepDesktopModule):
    """
    Devices module. Handles Cleep devices
    """

    CLEEPDESKTOP_HOSTNAME = 'CLEEPDESKTOP'
    CLEEPDESKTOP_PORT = '0'

    def __init__(self, context, debug_enabled):
        """
        Constructor

        Args:
            context (AppContext): application context
            debug_enabled (bool): True if debug is enabled
        """
        CleepDesktopModule.__init__(self, context, debug_enabled)

        #members
        self.devices = {}
        self.external_bus = PyreBus(
            self.on_message_received, 
            self.on_peer_connected, 
            self.on_peer_disconnected, 
            self.__decode_bus_headers, 
            debug_enabled, 
            self.context.crash_report
        )
        self.peers_uuids = {}

        #load devices
        self.__load_devices()

        #debug bus (full log report!)
        #pyre_logger = logging.getLogger("pyre")
        #pyre_logger.setLevel(logging.WARN)
        #pyre_logger.addHandler(logging.StreamHandler())
        #pyre_logger.propagate = False

    def _configure(self):
        """
        Bus process
        """
        #configure bus
        self.external_bus.configure(self.get_bus_headers())

    def _custom_process(self):
        """
        Custom process for cleep bus: get new message on external bus
        """
        self.external_bus.run_once()

    def _custom_stop(self):
        """
        Custom module stop. Close external bus
        """
        if self.external_bus:
            self.external_bus.stop()

    def __load_devices(self):
        """
        Load devices from configuration
        """
        self.devices = self.context.config.get_config_value('devices')
        self.logger.debug('Initial devices: %s' % self.devices)

    def __save_devices(self):
        """
        Save devices states
        """
        if not self.context.config.set_config_value('devices', self.devices):
            self.logger.error('Unable to save devices in configuration file')

    def get_bus_headers(self):
        """
        Headers to send at bus connection (values must be in string format!)

        Returns:
            dict: dict of headers (only string supported)
        """
        macs = self.external_bus.get_mac_addresses()
        #TODO handle port and ssl when security implemented
        headers = {
            'version': VERSION,
            'hostname': self.CLEEPDESKTOP_HOSTNAME,
            'port': self.CLEEPDESKTOP_PORT,
            'macs': json.dumps(macs),
            'ssl': '0',
            'cleepdesktop': '1',
            'apps': '',
        }
        self.logger.debug('headers: %s' % headers)

        return headers

    def __decode_bus_headers(self, headers):
        """
        Decode bus headers fields

        Args:
            headers (dict): dict of values as returned by bus

        Returns:
            dict: dict with parsed values
        """
        if u'port' in headers.keys():
            headers[u'port'] = int(headers[u'port'])
        if u'ssl' in headers.keys():
            headers[u'ssl'] = bool(eval(headers[u'ssl']))
        if u'cleepdesktop' in headers.keys():
            headers[u'cleepdesktop'] = bool(eval(headers[u'cleepdesktop']))
        if u'macs' in headers.keys():
            headers[u'macs'] = json.loads(headers[u'macs'])

        return headers

    def on_message_received(self, message):
        """
        Callback when message is received

        Args:
            message (??): received message
        """
        self.logger.debug('Received message: %s' % message)

        #convert message to dict and inject current timestamp
        msg = message.to_dict()
        msg['timestamp'] = int(time.time())

        self.context.update_ui('monitoring', msg)

    def on_peer_connected(self, peer, infos):
        """
        Callback when peer is connected
        
        Args:
            peer (string): peer id
            infos (dict): peer infos
        """
        self.logger.debug('Peer %s connected: %s' % (peer, infos))

        #drop cleepdesktop connection
        if infos['cleepdesktop']:
            self.logger.debug('Another CleepDesktop @%s connected. Drop it' % infos['ip'])
            return

        #after device restarted, pyre bus assigns new peer uuid, here we can encounter device that 
        #already exist so we need to purge obsolete device entries
        obsolete_peers = {peer:device for peer,device in self.peers_uuids.items() if device==infos['uuid']}
        if len(obsolete_peers)>=1:
            for obsolete_peer in obsolete_peers:
                del self.peers_uuids[obsolete_peer]

        #save new mapping (useful for disconnection)
        self.peers_uuids[peer] = infos['uuid']

        #append extra data
        infos['online'] = True
        infos['configured'] = False
        infos['connectedat'] = int(time.time())
        if len(infos['hostname'].strip())>0 and infos['hostname']!='cleepdevice':
            infos['configured'] = True

        #save peer infos
        self.devices[infos['uuid']] = infos
        self.__save_devices()

        #update ui
        self.context.update_ui('devices', self.get_devices())

    def on_peer_disconnected(self, peer):
        """
        Callback when peer is disconnected

        Args:
            peer (string): peer id
        """
        self.logger.debug('Peer %s disconnected' % peer)

        #get device uuid
        device_uuid = self.peers_uuids[peer] if peer in self.peers_uuids.keys() else None

        #only update online status of disconnected device
        if device_uuid:
            self.devices[device_uuid]['online'] = False
            self.__save_devices()

        #always update ui
        self.context.update_ui('devices', self.get_devices())

    def get_devices(self):
        """
        Return known devices (online or not)

        Returns:
            dict of devices
        """
        #compute unconfigured devices
        unconfigured = len([dev for dev in list(self.devices.values()) if dev['configured']])

        #prepare output
        out = {
            'unconfigured': unconfigured,
            'devices': list(self.devices.values())
        }
        self.logger.debug('devices: %s' % out)

        return out

    def delete_device(self, device_uuid):
        """
        Delete devices from internal list

        Returns:
            dict of devices like returned in get_devices()
        """
        if device_uuid not in self.devices:
            self.logger.error('Device "%s" does not exist in internal devices' % device_uuid)
            raise Exception('Device not found')

        #delete device
        del self.devices[device_uuid]
        self.__save_devices()

        return self.get_devices()
