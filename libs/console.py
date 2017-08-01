#!/usr/bin/env python
# -*- coding: utf-8 -*-

import sys
import subprocess
import time
from threading import Timer, Thread
try:
    from Queue import Queue, Empty
except ImportError:
    from queue import Queue, Empty  # python 3.x
import os
import signal
import logging
import re

ON_POSIX = 'posix' in sys.builtin_module_names

class EndlessConsole(Thread):
    """
    Helper class to execute long command line (system update...)
    This kind of console doesn't kill command line after timeout. It just let command running
    until end of it or if user explicitely requests to stop (or kill) it.

    Note: Subprocess output async reading copied from https://stackoverflow.com/a/4896288
    """

    def __init__(self, command, callback, callback_end=None):
        """
        Constructor

        Args:
            command (string): command to execute
            callback (function): callback when message is received
            callback_end (function): callback when process is over
        """
        Thread.__init__(self)
        Thread.daemon = True

        #members
        self.command = command
        self.callback = callback
        self.callback_end = callback_end
        self.logger = logging.getLogger(self.__class__.__name__)
        #self.logger.setLevel(logging.DEBUG)
        self.running = True
        self.__start_time = 0
        self.__stdout_queue = Queue()
        self.__stderr_queue = Queue()
        self.__stdout_thread = None
        self.__stderr_thread = None

    def __enqueue_output(self, output, queue):
        for line in iter(output.readline, b''):
            if not self.running:
                break
            queue.put(line.strip())
        try:
            output.close()
        except:
            pass
        self.logger.debug('Enqueued thread stopped')

    def __del__(self):
        """
        Destructor
        """
        self.stop()

    def get_start_time(self):
        """
        Return process start time

        Returns:
            float: start timestamp (with milliseconds)
        """
        return self.__start_time

    def stop(self):
        """
        Stop command line execution (kill it)
        """
        self.running = False

    def kill(self):
        """
        Stop command line execution
        """
        self.stop()

    def run(self):
        """
        Console process
        """
        #launch command
        self.__start_time = time.time()
        p = subprocess.Popen(self.command, shell=True, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, close_fds=ON_POSIX)
        pid = p.pid
        self.logger.debug('PID=%d' % pid)

        if self.callback:
            #async stdout reading
            self.__stdout_thread = Thread(target=self.__enqueue_output, args=(p.stdout, self.__stdout_queue))
            self.__stdout_thread.daemon = True
            self.__stdout_thread.start()

            #async stderr reading
            self.__stderr_thread = Thread(target=self.__enqueue_output, args=(p.stderr, self.__stdout_queue))
            self.__stderr_thread.daemon = True
            self.__stderr_thread.start()

        #wait for end of command line
        while self.running:
            #check process status
            p.poll()

            #read outputs and trigger callback
            if self.callback:
                stdout = None
                stderr = None
                try:
                    stdout = self.__stdout_queue.get_nowait()
                except:
                    pass
                try:
                    stderr = self.__stderr_queue.get_nowait()
                except:
                    pass
                if stdout is not None or stderr is not None:
                    self.callback(stdout, stderr)

            #check end of command
            if p.returncode is not None:
                self.logger.debug('Process is terminated')
                break
            
            #pause
            time.sleep(0.25)

        #make sure process is killed
        try:
            self.logger.debug('Kill process with PID %d' % pid)
            os.kill(pid, signal.SIGKILL)
        except:
            pass

        #process is over
        self.running = False

        #stop callback
        if self.callback_end:
            self.callback_end()


class Console():
    """
    Helper class to execute command lines
    """
    def __init__(self):
        self.timer = None
        self.__callback = None
        self.encoding = sys.getfilesystemencoding()

    def __del__(self):
        """
        Destroy console object
        """
        if self.timer:
            self.timer.cancel()

    def __process_lines(self, lines):
        """
        Remove end of line char for given lines and convert lines to unicode
        
        Args:
            lines (list): list of lines
        
        Results:
            list: input list of lines with eol removed
        """
        return [line.decode('utf-8').rstrip() for line in lines]

    def command(self, command, timeout=2.0):
        """
        Execute specified command line with auto kill after timeout
        
        Args:
            command (string): command to execute
            timeout (float): wait timeout before killing process and return command result

        Returns:
            dict: result of command::
                {
                    error (bool): True if error occured,
                    killed (bool): True if command was killed,
                    stdout (list): command line output
                    stderr (list): command line error
                }
        """
        #check params
        if timeout is None or timeout<=0.0:
            raise Exception(u'Timeout is mandatory and must be greater than 0')

        #launch command
        p = subprocess.Popen(command, shell=True, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, close_fds=ON_POSIX)
        pid = p.pid

        #wait for end of command line
        done = False
        start = time.time()
        killed = False
        while not done:
            #check if command has finished
            p.poll()
            if p.returncode is not None:
                #command executed
                done = True
                break
            
            #check timeout
            if time.time()>(start + timeout):
                #timeout is over, kill command
                p.kill()
                killed = True
                break

            #pause
            time.sleep(0.125)
       
        #prepare result
        result = {
            u'error': False,
            u'killed': killed,
            u'stdout': [],
            u'stderr': []
        }
        if not killed:
            err = self.__process_lines(p.stderr.readlines())
            if len(err)>0:
                result[u'error'] = True
                result[u'stderr'] = err
            else:
                result[u'stdout'] = self.__process_lines(p.stdout.readlines())

        #make sure process is really killed
        try:
            subprocess.Popen(u'/bin/kill -9 %s' % pid, shell=True)
        except:
            pass

        #trigger callback
        if self.__callback:
            self.__callback(result)

        return result

    def command_delayed(self, command, delay, timeout=2.0, callback=None):
        """
        Execute specified command line after specified delay

        Args:
            command (string): command to execute
            delay (int): time to wait before executing command (milliseconds)
            timeout (float): timeout before killing command
            callback (function): function called when command is over. Command result is passed as function parameter

        Note:
            Command function to have more details
        
        Returns:
            bool: True if command delayed succesfully or False otherwise
        """
        self.__callback = callback
        self.timer = Timer(delay, self.command, [command, timeout])
        self.timer.start()


class AdvancedConsole(Console):
    """
    Create console with advanced feature like find function
    """
    def __init__(self):
        Console.__init__(self)

    def find(self, command, pattern, options=re.UNICODE | re.MULTILINE, timeout=2.0):
        """
        Find all pattern matches in command stdout. Found order is respected.

        Args:
            pattern (string): search pattern
            options (flag): regexp flags (see https://docs.python.org/2/library/re.html#module-contents)

        Returns:
            list: list of matches::
                [
                    (group (string), subgroups (tuple)),
                    ...
                ]
        """
        results = []

        #execute command
        res = self.command(command, timeout)
        if res[u'error'] or res[u'killed']:
            #command failed
            return {}

        #parse command output
        content = u'\n'.join(res[u'stdout'])
        matches = re.finditer(pattern, content, options)

        for matchNum, match in enumerate(matches):
            group = match.group().strip()
            if len(group)>0 and len(match.groups())>0:
                #results[group] = match.groups()
                results.append((group, match.groups()))

        return results

    def find_in_string(self, string, pattern, options=re.UNICODE | re.MULTILINE):
        """
        Find all pattern matches in specified string. Found order is respected.

        Args:
            pattern (string): search pattern
            content (string): string to search in
            options (flag): regexp flags (see https://docs.python.org/2/library/re.html#module-contents)

        Returns:
            list: list of matches::
                [
                    (group (string), subgroups (tuple)),
                    ...
                ]
        """
        result = []
        matches = re.finditer(pattern, content, options)

        for matchNum, match in enumerate(matches):
            group = match.group().strip()
            if len(group)>0 and len(match.groups())>0:
                results.append((group, match.groups()))

        return results

