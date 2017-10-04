#!/usr/bin/env python
# -*- coding: utf-8 -*

import logging
import os
from cleep.utils import CleepremoteModule
from cleep.libs.externalbus import PyreBus

class Devices(CleepremoteModule):
    """
    Devices module. Handles Cleep devices
    """

    CLEEPDESKTOP_HOSTNAME = 'CLEEPDESKTOP'
    CLEEPDESKTOP_PORT = 0

    def __init__(self, update_callback, debug_enabled, crash_report):
        """
        Constructor
        """
        CleepremoteModule.__init__(self, debug_enabled, crash_report)

        #members
        self.devices = {}
        self.update_callback = update_callback
        self.bus = PyreBus(self.on_message_received, self.on_peer_connected, self.on_peer_disconnected, debug_enabled, crash_report)

        #debug bus
        #pyre_logger = logging.getLogger("pyre")
        #pyre_logger.setLevel(logging.WARN)
        #pyre_logger.addHandler(logging.StreamHandler())
        #pyre_logger.propagate = False

    def stop(self):
        if self.bus:
            self.bus.stop()

    def run(self):
        """
        Bus process
        """
        version = '0.0.0'
        hostname = self.CLEEPDESKTOP_HOSTNAME
        port = self.CLEEPDESKTOP_PORT
        ssl = False

        #launch bus (blocking)
        self.bus.start(version, hostname, port, ssl)

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

        #drop cleepdesktop connection
        if infos['hostname']==self.CLEEPDESKTOP_HOSTNAME and infos['port']==self.CLEEPDESKTOP_PORT:
            self.logger.debug('CleepDesktop connected. Drop it')
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

        return {
            'unconfigured': unconfigured,
            'devices': list(self.devices.values())
        }


