#!/usr/bin/env python
# -*- coding: utf-8 -*-

from core.common import MessageRequest, MessageResponse
import logging
import uuid
from threading import Event

class ExternalBus():
    """
    ExternalBus base class

    External bus is only based on event handling.
    This way of doing forces developper to handle async requests only.
    This also reduces bus complexity.

    This class provides:
        - peers list handling
        - base bus functions canvas (not implementation)
        - internal logger with debug enabled or not
    """

    COMMAND_RESPONSE_EVENT = 'external.command.response'

    def __init__(self, on_message_received, on_peer_connected, on_peer_disconnected, debug_enabled, crash_report):
        """
        Constructor

        Args:
            on_message_received (callback): function called when message is received on bus. It must returns a
                                            MessageResponse if request is a command. Function parameters::
                                            
                                            peer_ident (string): peer identifier
                                            request (MessageRequest): message request instance

            on_peer_connected (callback): function called when new peer connected. Function parameters::

                                            peer_ident (string): peer identifier
                                            peer_infos (PeerInfos): peer informations

            on_peer_disconnected (callback): function called when peer is disconnected. Function parameters::

                                            peer_ident (string): peer identifier

            debug_enabled (bool): True if debug is enabled
            crash_report (CrashReport): crash report instance
        """
        # members
        self.debug_enabled = debug_enabled
        self.crash_report = crash_report
        self._on_message_received = on_message_received
        self.on_peer_connected = on_peer_connected
        self.on_peer_disconnected = on_peer_disconnected
        # store command events ::
        # {
        #   command_uuid (string): {
        #       manual_response (function): function to call to send response to command back
        #   }
        # }
        self.__manual_responses = {}

        # logging
        self.logger = logging.getLogger(self.__class__.__name__)
        if self.debug_enabled:
            self.logger.setLevel(logging.DEBUG)
        else:
            self.logger.setLevel(logging.INFO)

    def run(self):
        """
        Run external bus process

        Warning:
            Must be implemented
        """
        raise NotImplementedError('run function must be implemented in "%s"' % self.__class__.__name__)

    def run_once(self):
        """
        Run external bus process once

        Warning:
            Must be implemented
        """
        raise NotImplementedError('run_once function must be implemented in "%s"' % self.__class__.__name__)

    def __ack_command_with_response(self, message):
        """
        Ack command sending received response

        Args:
            message (MessageRequest): message request
        """
        self.logger.debug('Send internal command response: %s' % str(message))
        if not message.command_uuid in self.__manual_responses:
            self.logger.warning('Command with uuid "%s" not referenced for sending response' % message.command_uuid)
            return

        # prepare response from request
        response = MessageResponse()
        response.fill_from_dict(message.params)

        # ack command
        self.logger.debug('Send internal command response back: %s' % str(response))
        if self.__manual_responses[message.command_uuid]['manual_response']:
            self.__manual_responses[message.command_uuid]['manual_response'](response)
        else:
            self.logger.warning('No manual response specified for external command. Internal command will terminate after timeout.')

        # clean
        del self.__manual_responses[message.command_uuid]

    def on_message_received(self, peer_id, message):
        """
        On message received event

        Args:
            peer_id (string): peer identifier
            message (MessageRequest): request message
        """
        if message.event == ExternalBus.COMMAND_RESPONSE_EVENT:
            # send response for received command
            self.__ack_command_with_response(message)
            return

        # process message
        response = self._on_message_received(peer_id, message)
        self.logger.debug('Command response: %s' % response)

        if response and message.is_command():
            # it's a command, response awaited
            if not message.command_uuid:
                self.logger.warning('Unable to send command response because command uuid is missing in %s' % message)
                return
            if not isinstance(response, MessageResponse):
                raise Exception('Command response must be a MessageResponse instance not "%s"' % type(response).__name__)
            self._send_command_response_to_peer(message, response)
        
    def _send_command_response_to_peer(self, request, response):
        """
        Send command response to peer

        Args:
            request (MessageRequest): message request
            response (MessageResponse): message response
        """
        # convert response to request
        self.logger.trace('request: %s' % request)
        self.logger.trace('response: %s' % response)
        message = MessageRequest()
        message.event = ExternalBus.COMMAND_RESPONSE_EVENT
        message.params = response.to_dict() # store message response in event params
        message.command_uuid = request.command_uuid
        message.peer_infos = request.peer_infos

        # and send created request
        self.logger.debug('Send command response to peer: %s' % message)
        self._send_message(message)

    def send_message(self, message, timeout=5.0, manual_response=None):
        """
        Send message (broadcast or to recipient) to outside

        Args:
            message (MessageRequest): message request instance
            timeout (float): command timeout
            manual_response (function): function to call to send back command response
        """
        if message.is_command():
            # it's a command, fill request with command identifier and timeout
            message.command_uuid = str(uuid.uuid4())
            message.timeout = timeout
            self.__manual_responses[message.command_uuid] = {
                'manual_response': manual_response,
            }

            # send command now, response should be returned by event
            self._send_message(message)

        else:
            # it's an event
            if message.peer_infos and message.peer_infos.uuid:
                self._send_message(message)
            else:
                self._broadcast_message(message)

    def _broadcast_message(self, message):
        """
        broadcast event message to all connected peers

        Args:
            message (MessageRequest): message instance

        Warning:
            Must be implemented
        """
        raise NotImplementedError('broadcast_message function is not implemented "%s"' % self.__class__.__name__)

    def _send_message(self, message):
        """
        Send event message to specified peer

        Args:
            message (MessageRequest): message instance

        Warning:
            Must be implemented
        """
        raise NotImplementedError('send_message function is not implemented "%s"' % self.__class__.__name__)
