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
import socket
import platform
if platform.system()=='Windows':
    #windows console specific import
    import win32api, win32con, win32event, win32process
    from win32com.shell.shell import ShellExecuteEx
    from win32com.shell import shellcon


class EndlessConsole(Thread):
    """
    Helper class to execute long command line (system update...)
    This kind of console doesn't kill command line after timeout. It just let command running
    until end of it or if user explicitely requests to stop (or kill) it.

    Note: Subprocess output async reading copied from https://stackoverflow.com/a/4896288
    """
    
    ERROR_NOTLAUNCHED = -1
    ERROR_STOPPED = -2
    ERROR_INTERNAL = -3

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
        self.console_encoding = 'utf-8'
        self.on_posix = True
        if sys.platform == 'win32':
            self.console_encoding = 'cp850'
            self.on_posix = False
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
        self.return_code = self.ERROR_NOTLAUNCHED
        self.__duration = 0.0

    def __del__(self):
        """
        Destructor
        """
        self.stop()
        
    def __enqueue_output(self, output, queue):
        """
        Enqueue output
        
        Args:
            output (filedescriptor) : output to look
            queue (Queue): Queue instance
        """
        for line in iter(output.readline, b''):
            if not self.running:
                break
            queue.put(line.strip())
        try:
            output.close()
        except:
            pass
            
    def get_duration(self):
        """
        Return command duration
        
        Return:
            float: time in milliseconds. 0.0 if command not terminated
        """
        return self.__duration
            
    def get_return_code(self):
        """
        Return command return code. Usually 0 if command was successful
        
        Return:
            int: return code, -1 if command stopped
        """
        return self.return_code

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
        self.return_code = self.ERROR_STOPPED
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
        p = subprocess.Popen(self.command, shell=True, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, close_fds=self.on_posix)
        pid = p.pid
        self.logger.debug('Command pid: %d' % pid)

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
                    if isinstance(stdout, bytes):
                        stdout = stdout.decode(self.console_encoding).rstrip()
                except:
                    pass
                try:
                    stderr = self.__stderr_queue.get_nowait()
                    if isinstance(stderr, bytes):
                        stderr = stderr.decode(self.console_encoding).rstrip()
                except:
                    pass
                if stdout is not None or stderr is not None:
                    self.callback(stdout, stderr)

            #check end of command
            if p.returncode is not None:
                self.return_code = p.returncode
                self.logger.debug('Process is terminated')
                break
            
            #pause
            time.sleep(0.25)
            
        #compute command duration
        self.__duration = time.time() - self.__start_time

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


class AdminEndlessConsole(EndlessConsole):
    """
    EndlessConsole version with privilege elevation (UAC) for windows
    How it works: this class launches windows command line with elavated rights.
    The command line executes cmdlogger.exe with user command (and arguments)
    Cmdlogger.exe catches stdout and stderr messages from user command and send them
    to WindowsUacEndlessConsole instance using socket.
    
    Note: code adapted from https://stackoverflow.com/q/31480571
    """
    
    #https://msdn.microsoft.com/fr-fr/library/windows/desktop/ms683189(v=vs.85).aspx
    PROCESS_STILLACTIVE = 259
    
    def __init__(self, command, callback, callback_end=None):
        """
        Constructor

        Args:
            command (string): command to execute
            callback (function): callback when message is received
            callback_end (function): callback when process is over
        """
        EndlessConsole.__init__(self, command, callback, callback_end)
        self.logger.setLevel(logging.DEBUG)
        
        #members
        self.cmdlogger_path = None
        self.comm_port = None
        
        #check command
        if not isinstance(command, list):
            raise Exception('Invalid command parameter: must be a list with the program in first position followed by its arguments')

    def set_cmdlogger(self, cmdlogger_path):
        """
        Set cmdlogger.exe fullpath
        """
        self.cmdlogger_path = cmdlogger_path
        if not os.path.exists(self.cmdlogger_path):
            raise Exception('Invalid cmdlogger path. The exe does not exist')
                
    #def is_admin():
    #    """
    #    Check running with admin privilege or not
    #    """
    #    try:
    #        if platform.system()=='Windows':
    #            import ctypes
    #            # WARNING: requires Windows XP SP2 or higher!
    #            return ctypes.windll.shell32.IsUserAnAdmin()
    #        else:
    #            #TODO for Linux and Darwin
    #            return False
    #    except:
    #        self.logger.exception('Admin check failed, assuming not admin:')
    #        return False
    
    def __quit_properly(self, return_code):
        """
        Quit process properly specifying return_code
        """
        self.return_code = return_code
        if self.callback_end:
            self.callback_end()
        
    def run(self):
        """
        Console process
        """
        #check cmdlogger
        if self.cmdlogger_path is None:
            self.__quit_properly(self.ERROR_INTERNAL)
            raise Exception('Please configure cmdlogger path before launching command')
        
        #get free communication port
        comm_port = None
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.bind(('',0))
            s.listen(1)
            comm_port = s.getsockname()[1]
            self.logger.debug('Use comm port: %d' % comm_port)
            s.close()
        except:
            self.logger.exception('Unable to get free communication port')
            self.__quit_properly(self.ERROR_INTERNAL)
            return
            
        #open communication socket
        comm_server = None
        try:
            comm_server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            comm_server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            comm_server.bind((u'', comm_port))
            if platform.system()=='Windows':
                #short timeout on windows
                comm_server.settimeout(5.0)
            else:
                #longer timeout on other platform due to password request
                comm_server.settimeout(1.0)
        except:
            self.logger.exception(u'Unable to create communication server')
            self.__quit_properly(self.ERROR_INTERNAL)
            return
            
        self.__start_time = time.time()
        if platform.system()=='Windows':
            #get command and command arguments
            user_cmd = u'"%s"' % self.command[0]
            user_cmd_params = u' '.join([u'"%s"' % (x,) for x in self.command[1:]])
            self.logger.debug(u'user_cmd=%s user_cmd_params=%s' % (user_cmd, user_cmd_params))

            #prepare cmdlogger command
            cmd = self.cmdlogger_path
            params = u'"%d" %s %s' % (comm_port, user_cmd, user_cmd_params)
            self.logger.debug(u'cmd=%s params=%s' % (cmd, params))

            #launch Windows command with parameters:
            # - hidden console
            # - rise UAC elevation
            self.logger.debug('Launch command on Windows')
            proc_info = ShellExecuteEx(nShow=win32con.SW_HIDE, fMask=shellcon.SEE_MASK_NOCLOSEPROCESS, lpVerb=u'runas', lpFile=cmd, lpParameters=params)
            proc_handle = proc_info[u'hProcess']
            pid = win32process.GetProcessId(proc_handle)

        elif platform.system()=='Darwin':
            #prepare cmdline
            params = [self.cmdlogger_path, str(comm_port), self.command[0]] + self.command[1:]
            self.logger.debug('params=%s' % params)
            cmd_line = 'osascript -e "do shell script \\"%s\\" with administrator privileges"' % u' '.join(params)
            self.logger.debug('cmdline=%s' % cmd_line)

            #launch command on macos with password requested by osascript
            self.logger.debug('Launch command on Darwin')
            proc_info = subprocess.Popen(cmd_line, shell=True, stdin=None, stdout=subprocess.PIPE, stderr=subprocess.PIPE, close_fds=self.on_posix)
            pid = proc_info.pid

        elif platform.system()=='Linux':
            #prepare cmdline
            params = [self.cmdlogger_path, str(comm_port), self.command[0]] + self.command[1:]
            self.logger.debug('params=%s' % params)
            cmd_line = 'pkexec %s' % u' '.join(params)
            self.logger.debug('cmdline=%s' % cmd_line)

            #launch command on linux with password requested by pkexec
            self.logger.debug('Launch command on Linux')
            proc_info = subprocess.Popen(cmd_line, shell=True, stdin=None, stdout=subprocess.PIPE, stderr=subprocess.PIPE, close_fds=self.on_posix)
            pid = proc_info.pid

        self.logger.debug(u'Command pid: %d' % pid)
        
        #wait for cmdlogger connection
        comm_server.listen(1)
        while True:
            try:
                self.logger.debug('Accepting...')
                (cmdlogger, (ip, port)) = comm_server.accept()
                #cmdlogger connected, stop statement
                break
            except socket.timeout:
                self.logger.debug('poll')
                if platform.system()=='Windows':
                    #TODO on windows check process is stil running
                    #http://docs.activestate.com/activepython/3.4/pywin32/win32event__WaitForSingleObject_meth.html
                    wfso = win32event.WaitForSingleObject(proc_handle, 100.0)
                    self.logger.debug('waitforsingleobj=%s' % wfso)
                else:
                    if proc_info.poll() is not None:
                        #process is terminated with surely execution failure or short time execution
                        self.logger.warn('No cmdlogger connected. Maybe command execution failed or was too quick')
                        self.__quit_properly(self.ERROR_INTERNAL)
                        return
            except:
                self.logger.exception('Exception during socket accept:')
                self.__quit_properly(self.ERROR_INTERNAL)
                return

        #look for cmdlogger messages
        while True:
            try:
                message = cmdlogger.recv(4096)
                self.logger.debug(u'Message received: %s' % message)
                if isinstance(message, bytes):
                    message = message.decode(self.console_encoding).rstrip()
            
                #check socket disconnection
                if message is None or len(message)==0:
                    self.logger.debug(u'Cmdlogger disconnected')
                    break
                else:
                    #process received message
                    if message.startswith(u'STDOUT:'):
                        #stdout
                        self.callback(message.replace(u'STDOUT:', u''), None)
                    else:
                        #stderr
                        self.callback(None, message.replace(u'STDERR:', u''))
            except socket.error:
                pass
                
        time.sleep(1.0)
                
        #get process return code
        if platform.system()=='Windows':
            self.return_code = win32process.GetExitCodeProcess(proc_handle)
        else:
            self.return_code = proc_info.returncode
        self.logger.debug('Return code: %s' % self.return_code)
        
        #close comm_server
        comm_server.close()
        
        #make sure process is killed
        try:
            self.logger.debug('Kill process with pid %d' % pid)
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
        self.console_encoding = 'utf-8'
        self.on_posix = True
        if sys.platform == 'win32':
            self.console_encoding = 'cp850'
            self.on_posix = False

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
        return [line.decode(self.console_encoding).rstrip() for line in lines]

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
        p = subprocess.Popen(command, shell=True, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, close_fds=self.on_posix)
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
            self.logger.debug('Kill process with PID %d' % pid)
            os.kill(pid, signal.SIGKILL)
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

if __name__ == '__main__':
    logging.basicConfig(level=logging.WARN, format='%(asctime)s %(name)s.%(funcName)s +%(lineno)s: %(levelname)-8s [%(process)d] %(message)s')    
    
    def command_terminated():
        print('Terminated')
        
    def command_callback(stdout, stderr):
        if stdout:
            print('Stdout from command: %s' % stdout)
        if stderr:
            print('Stderr from command: %s' % stderr)

    if platform.system()=='Windows':
        c = WindowsUacEndlessConsole(['chkdsk'], command_callback, command_terminated)
        c.set_cmdlogger('c:\\cleep-desktop\\tools\\cmdlogger\\cmdlogger.exe')
    elif platform.system()=='Darwin':
        c = AdminEndlessConsole(['/Users/tanguybonneau/cleepdesktop/cleep/libs/test.sh'], command_callback, command_terminated)
        c.set_cmdlogger('/Users/tanguybonneau/cleepdesktop/tools/cmdlogger-mac/cmdlogger')
    c.run()
        
