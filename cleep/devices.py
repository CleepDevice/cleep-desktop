#!/usr/bin/env python
# -*- coding: utf-8 -*

import logging
import os
import json
from cleep.version import version as VERSION
from cleep.utils import CleepDesktopModule
from cleep.libs.externalbus import PyreBus

class Devices(CleepDesktopModule):
    """
    Devices module. Handles Cleep devices
    """

    CLEEPDESKTOP_HOSTNAME = 'CLEEPDESKTOP'
    CLEEPDESKTOP_PORT = '0'

    def __init__(self, update_callback, debug_enabled, crash_report):
        """
        Constructor
        """
        CleepDesktopModule.__init__(self, debug_enabled, crash_report)

        #members
        self.devices = {}
        self.update_callback = update_callback
        self.external_bus = PyreBus(
            self.on_message_received, 
            self.on_peer_connected, 
            self.on_peer_disconnected, 
            self.__decode_bus_headers, 
            debug_enabled, 
            crash_report
        )

        #debug bus
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
        if self.external_bus:
            self.external_bus.stop()

    def get_bus_headers(self):
        """
        Headers to send at bus connection (values must be in string format)

        Return:
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
            'cleepdesktop': '1'
        }
        self.logger.debug('headers: %s' % headers)

        return headers

    def __decode_bus_headers(self, headers):
        """
        Decode bus headers fields

        Args:
            headers (dict): dict of values as returned by bus

        Return:
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
        #TODO

    def on_peer_connected(self, peer, infos):
        """
        Callback when peer is connected
        
        Args:
            peer (??): peer id
            infos (dict): peer infos
        """
        self.logger.debug('Peer %s connected: %s' % (peer, infos))

        #drop cleepdesktop connection0
        if infos['cleepdesktop']:
            self.logger.debug('CleepDesktop @ %s connected. Drop it' % infos['ip'])
            return

        #append online status and save peer infos
        infos['online'] = True
        self.devices[peer] = infos

        #update ui
        self.update_callback(self.get_devices())

    def on_peer_disconnected(self, peer):
        """
        Callback when peer is disconnected

        Args:
            peer (??): peer id
        """
        self.logger.debug('Peer %s disconnected' % peer)

        #keep peer entry locally but update its online status
        if peer in self.devices.keys():
            self.devices[peer]['online'] = False
        else:
            self.logger.info('Unknown peer %s disconnected (surely CleepDesktop instance)' % peer)

        #update ui
        self.update_callback(self.get_devices())

    def get_devices(self):
        """
        Return known devices (online or not)

        Return:
            dict of devices
        """
        #compute unconfigured devices
        unconfigured = len([dev for dev in list(self.devices.values()) if len(dev['hostname'])==0])

        #prepare output
        out = {
            'unconfigured': unconfigured,
            'devices': list(self.devices.values())
        }
        self.logger.debug('devices: %s' % out)

        return out


