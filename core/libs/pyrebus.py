#!/usr/bin/env python
# -*- coding: utf-8 -*-

import json
import logging
import time
import uuid
import binascii
import os
import ipaddress
from urllib.parse import urlparse
from core.libs.externalbus import ExternalBus
from core.common import MessageRequest, MessageResponse
from pyre_gevent import Pyre
from pyre_gevent.zhelper import get_ifaddrs as zhelper_get_ifaddrs, u
import zmq.green as zmq
import netifaces
import netaddr


class PyreBus(ExternalBus):
    """
    External bus based on Pyre library
    Pyre is python implementation of ZeroMQ ZRE concept (https://rfc.zeromq.org/spec:36/ZRE/)

    This code is based on chat example (https://github.com/zeromq/pyre/blob/master/examples/chat.py)
    """

    BUS_STOP = '$$STOP$$'

    POLL_TIMEOUT = 500 # ms

    def __init__(self,
                 on_message_received,
                 on_peer_connected,
                 on_peer_disconnected,
                 decode_peer_infos,
                 debug_enabled,
                 crash_report
                ):
        """
        Constructor

        Args:
            on_message_received (callback): function called when message is received on bus
            on_peer_connected (callback): function called when new peer connected
            on_peer_disconnected (callback): function called when peer is disconnected
            debug_enabled (bool): True if debug is enabled
            crash_report (CrashReport): crash report instance
        """
        ExternalBus.__init__(self, on_message_received, on_peer_connected, on_peer_disconnected, debug_enabled, crash_report)

        # bus logger
        pyre_logger = logging.getLogger('pyre')
        if debug_enabled:
            pyre_logger.setLevel(logging.DEBUG)
        else:
            pyre_logger.setLevel(logging.WARN)
        pyre_logger.addHandler(logging.StreamHandler())
        pyre_logger.propagate = False

        # members
        self.decode_peer_infos = decode_peer_infos
        self.__externalbus_configured = False
        self.node = None
        self.node_socket = None
        self.context = None
        self.poller = None
        self.pipe_in = None
        self.pipe_out = None
        self.__bus_name = None
        self.__bus_channel = None

    def get_mac_addresses(self):
        """
        Use pyre zhelper to get list of mac addresses used to identify cleep device
        Code copied from pyre-gevent/zbeacon

        Returns:
            list: list of mac addresses
        """
        macs = []
        netinf = zhelper_get_ifaddrs()
        for iface in netinf:
            # Loop over the interfaces and their settings to try to find the broadcast address.
            # ipv4 only currently and needs a valid broadcast address
            for name, data in iface.items():
                self.logger.debug('Checking out interface "%s": %s' % (name, data))
                data_2 = data.get(netifaces.AF_INET, None)
                data_10 = data.get(netifaces.AF_INET6, None)
                data_17 = data.get(netifaces.AF_LINK, None)
                # workaround: fallback to netifaces module to find mac addr
                if not data_17 and data_2:
                    data_17 = self.__get_mac_addresses_from_netifaces(data_2)

                if not data_2 and not data_10:
                    self.logger.debug('AF_INET(6) not found for interface "%s".' % name)
                    continue
                if not data_17:
                    self.logger.debug('AF_LINK not found for interface "%s".' % name)
                    continue

                address_str = (data_2 and data_2.get('addr', None)) or (data_10 and data_10.get('addr', None))
                netmask_str = (data_2 and data_2.get('netmask', None)) or (data_10 and data_10.get('netmask', None))
                mac_str = data_17.get('addr', None)

                if not address_str or not netmask_str:
                    self.logger.debug('Address or netmask not found for interface "%s".' % name)
                    continue
                if not mac_str:
                    self.logger.debug('Mac address not found for interface "%s".' % name)
                    continue

                if isinstance(address_str, bytes): # pragma: no cover
                    address_str = address_str.decode('utf8')

                if isinstance(netmask_str, bytes): # pragma: no cover
                    netmask_str = netmask_str.decode('utf8')

                if isinstance(mac_str, bytes): # pragma: no cover
                    mac_str = mac_str.decode('utf8')

                # drop loopback and link interfaces
                interface = ipaddress.ip_interface(u(address_str))
                if interface.is_loopback:
                    self.logger.debug('Interface "%s" is a loopback device, drop it.' %  name)
                    continue
                if interface.is_link_local:
                    self.logger.debug('Interface "%s" is a link-local device, drop it.' % name)
                    continue

                # keep only private interface (not exposed to internet)
                ip_address = netaddr.IPAddress(address_str)
                if ip_address and not ip_address.is_private():
                    self.logger.debug('Interface "%s" refers to public ip address, drop it.' % name)
                    continue

                macs.append(mac_str)

        return macs

    def __get_mac_addresses_from_netifaces(self, data_2):
        """
        Workaround to find mac addresses when not found using zhelper

        Args:
            data_2 (dict): AF_INET data

        Returns:
            dict: fake data_17 objects::

            {
                addr (string): mac address
            }

        """
        adapter = data_2.get('adapter', None)
        if not adapter:
            return None

        addresses = netifaces.ifaddresses(adapter)
        mac_addr = addresses.get(-1000, None) # mac addr field under windows :S

        if mac_addr and len(mac_addr)>0 and mac_addr[0].get('addr', None):
            return {
                'addr': mac_addr[0].get('addr')
            }
        return None

    def stop(self):
        """
        Stop bus
        """
        # send stop message to unblock pyre task
        if self.pipe_in is not None:
            self.logger.debug('Send STOP on pipe')
            self.pipe_in.send(json.dumps(self.BUS_STOP).encode('utf-8'))
            time.sleep(0.15)

            # and close everything
            self.pipe_in.close()
            self.pipe_in = None

            self.pipe_out.close()
            self.pipe_out = None

            try:
                self.node and self.node.stop()
            except zmq.ZMQError: # pragma: no cover
                pass
            except Exception:
                self.logger.exception('Exception stopping pyre node')
            time.sleep(0.15)
            self.node = None
            self.node_socket = None
            self.poller = None

            self.__externalbus_configured = False

    def start(self, infos, bus_name='CLEEP', bus_channel='CLEEP'):
        """
        Configure bus

        Args:
            infos (dict): peer infos
            bus_name (string): bus name to create. Default CLEEP
            bus_channel (string): bus channel to join. Default CLEEP
        """
        # check params
        if not infos or not isinstance(infos, dict):
            raise Exception('Parameter "infos" is not specified or invalid')
        if not bus_name or not isinstance(bus_name, str):
            raise Exception('Parameter "bus_name" is not specified or invalid')
        if not bus_channel or not isinstance(bus_channel, str):
            raise Exception('Parameter "bus_channel" is not specified or invalid')

        # save members
        self.__bus_name = bus_name
        self.__bus_channel = bus_channel

        # zmq context
        if self.context is None:
            self.context = zmq.Context()

        # communication pipe
        self.pipe_in = self.context.socket(zmq.PAIR)
        self.pipe_in.setsockopt(zmq.LINGER, 0)
        self.pipe_in.setsockopt(zmq.RCVHWM, 100)
        self.pipe_in.setsockopt(zmq.SNDHWM, 100)
        self.pipe_in.setsockopt(zmq.SNDTIMEO, 5000)
        self.pipe_in.setsockopt(zmq.RCVTIMEO, 5000)

        self.pipe_out = self.context.socket(zmq.PAIR)
        self.pipe_out.setsockopt(zmq.LINGER, 0)
        self.pipe_out.setsockopt(zmq.RCVHWM, 100)
        self.pipe_out.setsockopt(zmq.SNDHWM, 100)
        self.pipe_out.setsockopt(zmq.SNDTIMEO, 5000)
        self.pipe_out.setsockopt(zmq.RCVTIMEO, 5000)

        iface = 'inproc://%s' % binascii.hexlify(os.urandom(8))
        self.pipe_in.bind(iface)
        self.pipe_out.connect(iface)

        # create node
        self.node = Pyre(self.__bus_name)
        for key, value in infos.items():
            self.node.set_header(key, value)
        self.node.join(self.__bus_channel)
        self.node.start()

        # communication socket
        self.node_socket = self.node.socket()

        # poller
        self.poller = zmq.Poller()
        self.poller.register(self.pipe_out, zmq.POLLIN)
        self.poller.register(self.node_socket, zmq.POLLIN)

        self.__externalbus_configured = True

    def is_running(self):
        """
        Is pyrebus running

        Returns:
            bool: True if bus is running
        """
        return self.__externalbus_configured

    def run_once(self):
        """
        Run pyre polling bus once

        Returns:
            bool: return True all the time except when bus is stopped or not configured
                  This is only useful when run_once is called by 'run' function
        """
        # check configuration
        if not self.__externalbus_configured:
            self.logger.debug('External bus is not configured yet, maybe no netword connection')
            return False

        # poll external bus
        items = {}
        try:
            items = dict(self.poller.poll(self.POLL_TIMEOUT))
        except KeyboardInterrupt:
            # stop requested by user
            self.logger.debug('Stop Pyre bus')
            self.node.stop()
            return False
        except Exception:
            self.logger.exception('Exception occured during externalbus polling:')

        # process received data
        if self.pipe_out in items and items[self.pipe_out] == zmq.POLLIN:
            return self._message_to_send_to_pipe()
        if self.node_socket in items and items[self.node_socket] == zmq.POLLIN:
            return self._message_to_receive_from_pipe()

        # timeout
        return True

    def _message_to_receive_from_pipe(self):
        """
        Receive message from external bus

        Returns:
            bool: True to continue, False to stop external bus
        """
        data = self.node.recv()
        data_type = data.pop(0).decode('utf-8')
        data_peer = uuid.UUID(bytes=data.pop(0))
        data_name = data.pop(0).decode('utf-8')
        self.logger.trace('type=%s peer=%s name=%s' % (data_type, data_peer, data_name))

        # check message origin
        if data_name != self.__bus_name:
            self.logger.debug('Peer connected from another bus: peer=%s bus=%s' % (data_peer, data_name))
            return True

        if data_type in ('SHOUT', 'WHISPER'):
            # message received, decode it and trigger callback
            data_group = data.pop(0).decode('utf-8')

            # check message group
            if data_group != self.__bus_channel:
                # invalid group
                self.logger.debug('Message received from another channel "%s" (current "%s")' % (data_group, self.__bus_channel))
                return True

            # trigger message received callback
            try:
                data_content = data.pop(0)
                self.logger.debug('Raw data received on bus: %s' % data_content)
                raw_message = json.loads(data_content.decode('utf-8'))
                message = MessageRequest()
                message.fill_from_dict(raw_message)
                self.on_message_received(str(data_peer), message)
            except Exception:
                self.logger.exception('Error parsing peer message:')

        elif data_type == 'ENTER':
            # get message data
            infos = json.loads(data.pop(0).decode('utf-8'))
            self.logger.trace('Infos=%s' % infos)
            # get peer endpoint
            self.logger.trace('Peer endpoint: %s' % self.node.peer_address(data_peer))
            peer_endpoint = urlparse(self.node.peer_address(data_peer))

            # add new peer
            try:
                # decode peer infos
                peer_infos = self.decode_peer_infos(infos)
                self.logger.debug('Peer infos: %s' % peer_infos)
                # add extras to peer infos
                peer_infos.ident = str(data_peer)
                peer_infos.ip = peer_endpoint.hostname
                # save peer and trigger callback
                self.on_peer_connected(str(data_peer), peer_infos)
            except Exception:
                self.logger.exception('Error handling new peer connection')

        elif data_type == 'EXIT':
            # peer disconnected
            try:
                self.on_peer_disconnected(str(data_peer))
            except Exception:
                self.logger.exception('Error handling peer disconnection')

        return True

    def _clean_message(self, message):
        """
        Clean message removing useless field for external messaging

        Args:
            message (MessageRequest): message request instance

        Returns:
            dict: cleaned message request
        """
        message_dict = message.to_dict()
        message_dict.pop('startup', None)
        message_dict.pop('broadcast', None)
        message_dict.pop('peer_infos', None)

        return message_dict

    def _message_to_send_to_pipe(self):
        """
        Send message to outside

        Returns:
            bool: True to continue, False to stop external bus
        """
        # message to send
        try:
            data = self.pipe_out.recv()
            self.logger.trace('Raw data received on pipe: %s' % data)
            raw_message = json.loads(data.decode('utf-8'))
        except Exception:
            self.logger.exception('Error handling message to send')
            return True

        # stop node
        if raw_message == self.BUS_STOP:
            self.logger.debug('Stop Pyre bus')
            self.node.stop()
            return False

        # send message
        message = MessageRequest()
        message.fill_from_dict(raw_message)
        self.logger.debug('Send message: %s' % message)
        cleaned_message = self._clean_message(message)
        if message.peer_infos and message.peer_infos.ident:
            # whisper message (to peer)
            self.logger.debug('Whisper message: %s' % cleaned_message)
            self.node.whisper(uuid.UUID(message.peer_infos.ident), json.dumps(cleaned_message).encode('utf-8'))
        else:
            # shout message (broadcast)
            self.logger.debug('Shout message: %s' % cleaned_message)
            self.node.shout(self.__bus_channel, json.dumps(cleaned_message).encode('utf-8'))

        return True

    def run(self):
        """
        Run pyre bus in infinite loop (blocking)
        """
        self.logger.debug('Pyre node started')
        while True:
            try:
                if not self.__externalbus_configured:
                    # bus not configured (no network yet?), pause
                    time.sleep(0.25)

                elif not self.run_once():
                    # stop requested
                    self.logger.debug('Stop requested programmatically')
                    break

            except KeyboardInterrupt: # pragma: no cover
                # user stop
                self.logger.debug('Stop requested manually (CTRL-C)')
                break

            except Exception:
                self.logger.exception('Exception during external bus process:')

        self.logger.debug('Pyre node terminated')

    def _broadcast_message(self, message):
        """
        Broadcast message

        Args:
            message (MessageRequest): message to send
        """
        # no difference between message to recipient or broadcast message due to pipe implementation,
        # message difference is made in __message_to_send_to_pipe
        self._send_message(message)

    def _send_message(self, message):
        """
        Send message to specified peer

        Args:
            message (MessageRequest): message to send. Can be a command or an event
        """
        # check bus
        if not self.__externalbus_configured:
            self.logger.warning('External bus is not configured yet, maybe no netword connection, message not sent')
            return

        # send message
        self.pipe_in.send(json.dumps(message.to_dict()).encode('utf-8'))
