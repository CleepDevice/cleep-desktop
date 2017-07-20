#!/usr/bin/env python
# -*- coding: utf-8 -*-

import subprocess
import time
from threading import Timer, Thread
import os
import signal
import logging
import sys
import re

class EndlessConsole(Thread):
    """
    Helper class to execute long command line (system update...)
    This kind of console doesn't kill command line after timeout. It just let command line running
    until end of it or if user explicitely requests to stop (or kill) it.
    """

    def __init__(self, command, callback, logger):
        """
        Constructor

        Args:
            command (string): command to execute
            callback (function): callback when message is received
            logger (Logger): logger
        """
        Thread.__init__(self)
        Thread.daemon = True

        #members
        self.logger = logger
        self.running = True

    def __del__(self):
        """
        Destructor
        """
        self.stop()

    def __log(self, message, level):
        """
        Log facility

        Args:
            message (string): message to log
            level (int): log level
        """
        if self.logger:
            if level==logging.DEBUG:
                self.logger.debug(message)
            if level==logging.INFO:
                self.logger.info(message)
            if level==logging.WARN:
                self.logger.warn(message)
            if level==logging.ERROR:
                self.logger.error(message)

    def stop(self):
        """
        Stop command line execution (kill it)
        """
        self.running = False

    def kill(self):
        """
        Stop command line execution
        """
        self.running = False

    def run(self):
        """
        Console process
        """
        #launch command
        p = subprocess.Popen(command, shell=True, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, close_fds=True)
        pid = p.pid

        #wait for end of command line
        while not done:
            #check if command has finished
            p.poll()

            #read outputs and launch callbacks
            if self.callback:
                (stdout, stderr) = p.communicate()
                if len(stdout)>0 or len(stderr)>0:
                    self.callback(stdout, stderr)

            #check end of command
            if p.returncode is not None:
                break
            
            #kill on demand
            if not self.running:
                p.kill()
                break

            #pause
            time.sleep(0.125)

        #make sure process is killed
        os.kill(pid, signal.SIGKILL)


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
        p = subprocess.Popen(command, shell=True, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, close_fds=True)
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

