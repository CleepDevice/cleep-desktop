#!/usr/bin/env python
# -*- coding: utf-8 -*

import logging
import os
import json
import time
from distutils.util import strtobool
from core.version import VERSION
from core.utils import CleepDesktopModule
from core.libs.pyrebus import PyreBus
from core.common import MessageRequest, PeerInfos

class Devices(CleepDesktopModule):
    """
    Devices module. Handles Cleep devices
    """

    CLEEPDESKTOP_HOSTNAME = 'CLEEPDESKTOP'
    CLEEPDESKTOP_PORT = '0'
    UNCONFIGURED_DEVICE_HOSTNAME = 'cleepdevice'

    def __init__(self, context, debug_enabled):
        """
        Constructor

        Args:
            context (AppContext): application context
            debug_enabled (bool): True if debug is enabled
        """
        CleepDesktopModule.__init__(self, context, debug_enabled)

        # members
        self.external_bus = PyreBus(
            self._on_message_received,
            self._on_peer_connected,
            self._on_peer_disconnected,
            self.__decode_peer_infos,
            debug_enabled,
            self.context.crash_report
        )
        # peers list::
        #   {
        #       peer uuid (string): {
        #           peer_id (string): current peer identifier
        #           peer_ip (string): current peer ip
        #           ... peer infos from received infos
        #       },
        #       ...
        #   }
        self.peers = {}

        # load devices
        self.__load_devices()

        # debug bus (full log report!)
        # pyre_logger = logging.getLogger("pyre")
        # pyre_logger.setLevel(logging.WARN)
        # pyre_logger.addHandler(logging.StreamHandler())
        # pyre_logger.propagate = False

    def _configure(self):
        """
        Bus process
        """
        # configure bus
        if not self.external_bus.start(self.get_bus_headers()):
            self.logger.warning('Cleep-desktop is not connected to Cleep network. It can\'t find any device.')
            self.context.crash_report.manual_report('Unable to connect to pyre network', {
                'endpoint': self.external_bus.endpoint,
                'macs': self.external_bus.get_mac_addresses(),
                'interfaces': self.external_bus.get_network_interfaces_names(),
            })
            self.context.update_ui('network', {
                'connected': False
            })

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
        devices = self.context.config.get_config_value('devices')
        for device in devices.values():
            peer_infos = PeerInfos()
            peer_infos.fill_from_dict(device)
            # force device to offline at startup. If devices are discovered
            # connected event will be triggered and will update device connected status
            peer_infos.online = False
            # drop cleepdesktop if any in list of devices
            if peer_infos.cleepdesktop:
                continue
            self.peers[peer_infos.uuid] = peer_infos
        self.logger.debug('Loaded peers: %s' % {peer_uuid: str(infos) for peer_uuid, infos in self.peers.items()})

    def __save_devices(self):
        """
        Save devices states
        """
        devices = {peer_uuid: peer_infos.to_dict() for peer_uuid, peer_infos in self.peers.items()}
        if not self.context.config.set_config_value('devices', devices):
            self.logger.error('Unable to save devices in configuration file')

    def get_bus_headers(self):
        """
        Headers to send at bus connection (values must be in string format!)

        Returns:
            dict: dict of headers (only string supported)
        """
        macs = self.external_bus.get_mac_addresses()
        # TODO handle port and ssl when security implemented
        headers = {
            'version': VERSION,
            'hostname': self.CLEEPDESKTOP_HOSTNAME,
            'port': self.CLEEPDESKTOP_PORT,
            'macs': json.dumps(macs),
            'ssl': '0',
            'cleepdesktop': '1',
            'apps': json.dumps({}),
        }
        self.logger.debug('headers: %s' % headers)

        return headers

    def __decode_peer_infos(self, infos):
        """
        Decode peer infos

        It is used to transform peer connection infos to appropriate python type (all values in infos are string).

        Args:
            infos (dict): dict of decoded values

        Returns:
            PeerInfos: peer informations
        """
        self.logger.debug('Raw value to decode: %s' % infos)
        peer_infos = PeerInfos()
        peer_infos.uuid = infos.get('uuid', None)
        peer_infos.hostname = infos.get('hostname', None)
        peer_infos.port = int(infos.get('port', peer_infos.port))
        peer_infos.ssl = bool(strtobool(infos.get('ssl', '%s' % peer_infos.ssl)))
        peer_infos.cleepdesktop = bool(strtobool(infos.get('cleepdesktop', '%s' % peer_infos.cleepdesktop)))
        peer_infos.macs = json.loads(infos.get('macs', '[]'))
        peer_infos.extra = {
            key: self.__decode_header_value(key, value)
            for key, value in infos.items()
            if key not in ['uuid', 'hostname', 'port', 'ssl', 'cleepdesktop', 'macs']
        }

        return peer_infos

    def __decode_header_value(self, key, value):
        """
        Json decode value from header

        Args:
            key (string): header keys
            value (string): header value to decode

        Returns:
            decoded value
        """
        # handle legacy apps header value
        if key == 'apps' and not value.startswith('['):
            value = json.dumps(value.split(','))

        # decode value
        try:
            return json.loads(value)
        except:
            return value

    def _on_message_received(self, peer_id, message):
        """
        Handle received message from external bus

        Args:
            peer_id (string): peer identifier
            message (MessageRequest): message from external bus

        Returns:
            MessageResponse if message is a command
        """
        # fill message with peer infos
        peer_infos = self._get_peer_infos_from_peer_id(peer_id)
        if not peer_infos:
            self.logger.warning('Received message from unknown peer "%s", drop it: %s' % (peer_id, message))
        message.peer_infos = peer_infos
        self.logger.debug('Message received on external bus: %s' % message)

        # convert message to dict and inject current timestamp
        msg = message.to_dict()
        msg['timestamp'] = int(time.time())

        self.context.update_ui('monitoring', msg)

    def _on_peer_connected(self, peer_id, peer_infos):
        """
        Device is connected

        Args:
            peer_id (string): peer identifier
            peer_infos (PeerInfos): peer informations (ip, port, ssl...)
        """
        self.logger.debug('Peer connected with %s' % peer_infos.to_dict())

        # drop other cleep-desktop connection
        if peer_infos.cleepdesktop:
            self.logger.debug('Drop other cleep-desktop connection')
            return

        # find existing peer
        existing_peer_uuid = self._find_existing_peer(peer_infos)

        if existing_peer_uuid:
            # remove existing one
            self.logger.debug('Remove existing peer %s' % existing_peer_uuid)
            del self.peers[existing_peer_uuid]

        # save new peer
        peer_infos.online = True
        peer_infos.extra['connectedat'] = int(time.time())
        peer_infos.extra['configured'] = False
        if len(peer_infos.hostname.strip()) > 0 and peer_infos.hostname != self.UNCONFIGURED_DEVICE_HOSTNAME:
            peer_infos.extra['configured'] = True
        self.peers[peer_infos.uuid] = peer_infos
        self.logger.debug('Peer %s connected: %s' % (peer_id, peer_infos))
        self.__save_devices()

        # update ui
        self.context.update_ui('devices', self.get_devices())

    def _on_peer_disconnected(self, peer_id):
        """
        Device is disconnected
        """
        self.logger.debug('Peer %s disconnected' % peer_id)
        peer_infos = self._get_peer_infos_from_peer_id(peer_id)
        if not peer_infos:
            self.logger.warning('Peer "%s" is unknown' % peer_id)
            return

        # save changes and refresh ui
        peer_infos.online = False
        self.__save_devices()
        self.context.update_ui('devices', self.get_devices())

    def get_devices(self):
        """
        Return known devices (online or not)

        Returns:
            dict of devices
        """
        # compute unconfigured devices
        unconfigured = len([device for device in list(self.peers.values()) if not device.extra.get('configured', False)])

        # prepare output
        out = {
            'unconfigured': unconfigured,
            'devices': [peer_infos.to_dict() for peer_infos in self.peers.values()]
        }
        self.logger.debug('devices: %s' % out)

        return out

    def delete_device(self, peer_uuid):
        """
        User deletes device manually

        Args:
            peer_uuid (string): peer uuid to delete

        Returns:
            dict of devices like returned in get_devices()
        """
        if peer_uuid not in self.peers:
            self.logger.error('Device "%s" does not exist in internal devices' % peer_uuid)
            raise Exception('Device not found')

        # delete device
        del self.peers[peer_uuid]
        self.__save_devices()

        return self.get_devices()

    def _get_peer_infos_from_peer_id(self, peer_id):
        """
        Search in peers dict for peer_id and returns its informations

        Args:
            peer_id (string): peer identifier

        Returns:
            dict: peer informations or None
        """
        filtered = [peer for peer in self.peers.values() if peer.ident == peer_id]
        return filtered[0] if len(filtered) > 0 else None

    def _find_existing_peer(self, peer_infos):
        """
        Based on specified peer_infos content mac adresses) this function tries to find an exiting peer.

        Args:
            peer_infos (PeerInfos): peer informations

        Returns:
            string: peer uuid if existing peer exists
        """
        for peer_uuid, infos in self.peers.items():
            if len(set(infos.macs) & set(peer_infos.macs)) != 0:
                # some mac addresses are identicals, we can consider it is the same peer
                return peer_uuid

        return None
