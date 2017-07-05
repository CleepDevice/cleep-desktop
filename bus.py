#!/usr/bin/env python
# -*- coding: utf-8 -*-

import sys
import logging
import threading
import time
import math
import inspect
from collections import deque
from threading import Event
from libs.task import Task
from queue import Queue
from utils import MessageResponse, MessageRequest, NoMessageAvailable, InvalidParameter, BusError, NoResponse, CommandError, CommandInfo, BusNotReady, InvalidModule

__all__ = ['MessageBus', 'BusClient']

class MessageBus():
    """
    Message bus
    Used to send messages to subscribed clients
    A pushed message can have recipient to directly send message to specific client. In that case
    a response is awaited. If there is no response before end of timeout, an exception is throwed.
    A message without recipient is broadcasted to all subscribers. No response is awaited.
    Only broadcasted messages can be sent before all clients have subscribed (during init phase)
    """
    def __init__(self, debug_enabled):
        #init
        self.logger = logging.getLogger(self.__class__.__name__)
        if debug_enabled:
            self.logger.setLevel(logging.DEBUG)

        #module message queues
        self.__queues = {}
        #module queue activities
        self.__activities = {}
        #subscription lifetime (in seconds)
        self.lifetime = 600
        #purge task
        self.__purge = None
        #configured flag
        self.__app_configured = False
        self.__deferred_messages = Queue()

    def stop(self):
        """
        Stop bus
        """
        if self.__purge:
            self.__purge.stop()

    def app_configured(self):
        """
        Say message bus is configured
        /!\ This way of proceed is dangerous if clients always broadcast messages, the bus may always stay
        blocked in "app not configured" state. But in small system like raspiot, it should be fine.
        """
        #first of all unqueue deferred messages to preserve order
        self.logger.debug('Unqueue deferred message')
        while not self.__deferred_messages.empty():
            msg = self.__deferred_messages.get()
            #msg.startup = True
            self.logger.debug('Push deferred: %s' % str(msg))
            for q in self.__queues:
                self.__queues[q].append(msg)

        #then set app is configured
        self.__app_configured = True

        #and finally launch purge subscriptions task
        self.__purge = Task(60.0, self.purge_subscriptions)
        self.__purge.start()

        #broadcast event application is ready
        request = MessageRequest()
        request.event = 'system.application.ready'
        self.push(request)

        #now push function will handle new messages

    def push(self, request, timeout=3.0):
        """
        Push message to specified module and wait for response until timeout.
        By default it is blocking but with timeout=0.0 the function returns instantly
        without result, but command is sent.

        Args:
            request (MessageRequest): message to push.
            timeout (float): time to wait for response. If not specified, function returns None.

        Returns:
            MessageResponse: message response instance.
            None: if request is event or broadcast.

        Raises:
            InvalidParameter: if request is not a MessageRequest instance.
            NoResponse: if no response is received from module.
            BusNotReady: if bus is not ready when message is pushed (catch event 'system.application.ready' if exception received).
            InvalidModule: if specified recipient is unknown.
        """
        if isinstance(request, MessageRequest):
            #get request as dict
            request_dict = request.to_dict(not self.__app_configured)
            self.logger.debug('Push %s => %s' % (request_dict, request.to))

            #push message to specified queue
            if request.to in self.__queues:
                #prepare event
                event = None
                if timeout:
                    event = Event()

                #prepare message
                msg = {'message':request_dict, 'event':event, 'response':None}
                self.logger.debug('MessageBus: push to "%s" message %s' % (request.to, str(msg)))

                #log module activity
                self.__activities[request.to] = time.time()

                #append message to queue
                self.__queues[request.to].appendleft(msg)

                #and wait for response or not (if no timeout)
                if event:
                    #wait for response
                    self.logger.debug('MessageBus: push wait for response (%s seconds)....' % str(timeout))
                    if event.wait(timeout):
                        #response received
                        self.logger.debug(' - resp received %s' % str(msg))
                        return msg['response']
                    else:
                        #no response in time
                        self.logger.debug(' - timeout')
                        raise NoResponse()
                else:
                    #no timeout given, return nothing
                    return None

            elif request.to==None:
                #broadcast message to every modules, without waiting for a response
                #prepare message
                msg = {'message':request_dict, 'event':None, 'response':None}
                self.logger.debug('MessageBus: broadcast message %s' % str(msg))

                if self.__app_configured:
                    #append message to queues
                    for q in self.__queues:
                        self.__queues[q].appendleft(msg)
                else:
                    #defer message if app not configured yet
                    self.logger.debug('defer message: %s' % str(msg))
                    self.__deferred_messages.put(msg)
    
                return None

            elif not self.__app_configured:
                #surely a message with recipient, but app is not configured yet
                raise BusNotReady()

            else:
                #app is configured but recipient is unknown
                raise InvalidModule(request.to)

        else:
            raise InvalidParameter('Request parameter must be MessageRequest instance')

    def pull(self, module, timeout=0.5):
        """
        Pull message from specified module queue.

        Args:
            module (string): module name;
            timeout (float): time to wait, default is blocking (0.5s).

        Returns:
            MessageResponse: received message.

        Raises:
            InvalidModule: if module is unknown.
            BusError: if fatal error occured during message pulling.
            NoMessageAvailable: if no message is available.
        """
        _module = module.lower()
        if _module in self.__queues:

            #log module activity
            self.__activities[_module] = int(time.time())

            if not timeout:
                #no timeout specified, try to pop a message and return just after
                try:
                    msg = self.__queues[_module].pop()
                    self.logger.debug('MessageBus: %s pulled noto: %s' % (_module, msg))
                    return msg

                except IndexError:
                    #no message available
                    raise NoMessageAvailable()

                except:
                    self.logger.exception('MessageBus: error when pulling message:')
                    raise BusError('Error when pulling message')
            else:
                #timeout specified, try to read each 0.1 seconds a message until specified timeout
                loop = math.floor(timeout / 0.10)
                i = 0
                while i<loop:
                    try:
                        msg = self.__queues[_module].pop()
                        self.logger.debug('MessageBus: %s pulled %s' % (_module, msg))
                        return msg

                    except IndexError:
                        #no message available
                        pass

                    except:
                        #unhandled error
                        self.logger.exception('MessageBus: error when pulling message:')
                        raise BusError('Error when pulling message')

                    finally:
                        time.sleep(0.10)
                        i += 1

                #end of loop and no message found
                raise NoMessageAvailable()

        else:
            #subscriber not found
            self.logger.error('Module %s not found' % _module)
            raise InvalidModule('Unknown module name %s, check "module" param' % _module)

    def add_subscription(self, module):
        """
        Add new subscription.

        Args:
            module (string): module name.
        """
        _module = module.lower()
        self.logger.debug('Add subscription for module %s' % _module)
        self.__queues[_module] = deque()
        self.__activities[_module] = int(time.time())

    def remove_subscription(self, module):
        """
        Remove existing subscription;

        Args:
            module (string): module name.

        Raises:
            InvalidParameter: if module is unknown.
        """
        _module = module.lower()
        self.logger.debug('Remove subscription for module %s' % _module)
        if _module in self.__queues:
            del self.__queues[_module]
            del self.__activities[_module]
        else:
            #uuid does not exists
            self.logger.error('Subscriber %s not found' % _module)
            raise InvalidModule('Unknown module name, check "module" param')

    def is_subscribed(self, module):
        """
        Check if module is subscribed.

        Args:
            module (string): module name.

        Returns:
            bool: True if module is subscribed.
        """
        return module.lower() in self.__queues

    def purge_subscriptions(self):
        """
        Purge old subscriptions.
        """
        now = int(time.time())
        copy = self.__activities.copy()
        for module, last_pull in iter(copy.items()):
            if now>last_pull+self.lifetime:
                #remove inactive subscription
                self.logger.debug('Remove obsolete subscription "%s"' % module)
                self.remove_subscription(module)




class BusClient(threading.Thread):
    """
    BusClient class must be inherited to handle message from MessageBus.
    It reads module message, read command and execute module command.
    Finally it returns command response to message originator.
    """
    def __init__(self, bus):
        threading.Thread.__init__(self)
        self.__continue = True
        self.bus = bus
        self.__name = self.__class__.__name__
        self.__module = self.__name.lower()

        #add subscription
        self.bus.add_subscription(self.__name)

    def __del__(self):
        self.stop()

    def stop(self):
        self.__continue = False

    def __check_params(self, function, message, sender):
        """
        Check if message contains all necessary function parameters.

        Args:
            function (function): function reference.
            message (dict): current message content (contains all command parameters).
            sender (string): message sender ("from" item from MessageRequest).

        Returns:
            tuple: (
                bool: True or False,
                dict: args to pass during command call or None
            )
        """
        args = {}
        params_with_default = {}
        #self.logger.debug('message params:%s' % (message))

        #get function parameters
        (params, _, _, defaults) = inspect.getargspec(function)
        #self.logger.debug('params:%s default:%s' % (params, defaults))

        #check message parameters according to function parameters
        if message is None or not isinstance(message, dict) and len(params)==0:
            #no parameter needed
            return True, args

        #check params with default value
        if defaults is None:
            defaults = ()
        for param in params:
            params_with_default[param] = False
        for pos in range(len(params)-len(defaults), len(params)):
            params_with_default[params[pos]] = True

        #fill parameters list
        for param in params:
            if param=='self':
                #drop self param
                pass
            elif param=='command_sender':
                #function needs request sender value
                args['command_sender'] = sender
            elif param not in message and not params_with_default[param]:
                #missing parameter
                return False, None
            else:
                #update function arguments list
                if param in message:
                    args[param] = message[param]

        return True, args

    def push(self, request, timeout=3.0):
        """
        Push message to specified module and wait for response until timeout.
        By default it is blocking but with timeout=0.0 the function returns instantly
        without result, but command is sent.

        Args:
            request (MessageRequest): message to push.
            timeout (float): time to wait for response. If not specified, function returns None.

        Returns:
            MessageResponse: message response instance.
            None: if request is event or broadcast.

        Raises:
            InvalidParameter: if request is not a MessageRequest instance.
        """
        if isinstance(request, MessageRequest):
            #fill sender
            request.from_ = self.__module

            if request.is_broadcast() or timeout is None or timeout==0.0:
                #broadcast message or no timeout, so no response
                self.bus.push(request, timeout)
                return None
            else:
                #response awaited
                resp = self.bus.push(request, timeout)
                return resp
        else:
            raise InvalidParameter('Request parameter must be MessageRequest instance')

    def send_event(self, event, params=None, uuid=None, to=None):
        """
        Helper function to push event message to bus.

        Args:
            event (string): event name.
            params (dict): event parameters.
            uuid (string): device uuid that send event. If not specified event cannot be monitored.
            to (string): event recipient. If not specified, event will be broadcasted.

        Returns:
            None: event always returns None.
        """
        request = MessageRequest()
        request.to = to
        request.event = event
        request.uuid = uuid
        request.params = params

        return self.push(request, None)

    def send_command(self, command, to, params=None, timeout=3.0):
        """
        Helper function to push command message to bus.

        Args:
            command (string): command name.
            to (string): command recipient. If None the command is broadcasted but you'll get no reponse in return.
            params (dict): command parameters.
            timeout (float): change default timeout if you wish. Default is 3 seconds.

        Returns:
            MessageResponse: push response.
            None; if command is broadcast.
        """
        request = MessageRequest()
        request.to = to
        request.command = command
        request.params = params

        return self.push(request, timeout)

    def run(self):
        """
        Bus reading process.
        """
        self.logger.debug('BusClient %s started' % self.__name)

        #check messages
        while self.__continue:
            try:
                #self.logger.debug('BusClient: pull message')
                msg = {}
                try:
                    #get message
                    msg = self.bus.pull(self.__name)
                    #self.logger.debug('BusClient: %s received %s' % (self.__name, msg))

                except NoMessageAvailable:
                    #no message available
                    #self.logger.debug('BusClient no msg avail')
                    continue

                except KeyboardInterrupt:
                    #user stop raspiot
                    break

                #create response
                resp = MessageResponse()
       
                #process message
                #self.logger.debug('BusClient: %s process message' % (self.__name))
                if u'message' in msg:
                    if u'command' in msg[u'message']:
                        #command received, process it
                        if u'command' in msg[u'message'] and msg[u'message'][u'command']!=None and len(msg[u'message'][u'command'])>0:
                            try:
                                #get command reference
                                self.logger.debug('BusClient: %s get command' % (self.__name))
                                command = getattr(self, msg['message']['command'])

                                #check if command was found
                                if command is not None:
                                    #check if message contains all command parameters
                                    (ok, args) = self.__check_params(command, msg['message']['params'], msg['message']['from'])
                                    self.logger.debug('BusClient: ok=%s args=%s' % (ok, args))
                                    if ok:
                                        #execute command
                                        try:
                                            resp.data = command(**args)
                                        except CommandError as e:
                                            self.logger.error('Command error: %s' % str(e))
                                            resp.error = True
                                            resp.message = str(e)
                                        except CommandInfo as e:
                                            #informative message
                                            resp.message = str(e)
                                        except Exception as e:
                                            #command failed
                                            self.logger.exception('bus.run exception')
                                            resp.error = True
                                            resp.message = '%s' % str(e)
                                    else:
                                        resp.error = True
                                        resp.message = 'Some command parameters are missing'

                            except AttributeError:
                                #specified command doesn't exists in this module
                                self.logger.exception('Command "%s" doesn\'t exist in "%s" module' % (msg['message']['command'], self.__name))
                                resp.error = True
                                resp.message = 'Command "%s" doesn\'t exist in "%s" module' % (msg['message']['command'], self.__name)

                            except:
                                #specified command is malformed
                                self.logger.exception('Command is malformed:')
                                resp.error = True
                                resp.message = 'Received command was malformed'

                        else:
                            #no command specified
                            self.logger.error('BusClient: No command specified in message %s' % msg['message'])
                            resp.error = True
                            resp.message = 'No command specified in message'
                                
                        #save response into message    
                        msg['response'] = resp.to_dict()

                        #unlock event if necessary
                        if msg['event']:
                            #event available, client is waiting for response, unblock it
                            self.logger.debug('BusClient: unlock event')
                            msg['event'].set()
                    
                    elif u'event' in msg['message']:
                        #event received, process it
                        try:
                            event_received = getattr(self, 'event_received')
                            if event_received is not None:
                                #function implemented in object, execute it
                                event_received(msg['message'])
                        except AttributeError:
                            #on_event function not implemented, drop received message
                            #self.logger.debug('event_received not implemented, received message dropped')
                            pass
                        except:
                            #do not crash module
                            self.logger.exception('event_received exception:')

                else:
                    #received message is badly formatted
                    self.logger.warning('Received message is badly formatted, message dropped')

            except:
                #error occured
                self.logger.exception('BusClient: fatal exception')
                self.stop()

            #self.logger.debug('----> sleep')
            #time.sleep(1.0)

        #remove subscription
        self.bus.remove_subscription(self.__name)
        self.logger.debug('BusClient %s stopped' % self.__name)



class TestPolling(threading.Thread):
    """
    Only for debug purpose
    Object to send periodically message to subscriber
    """
    def __init__(self, bus):
        threading.Thread.__init__(self)
        self.bus = bus
        self.c = True

    def stop(self):
        self.c = False

    def run(self):
        while self.c:
            bus.push(time.strftime('%A %d %B, %H:%M:%S'))
            time.sleep(5)

