#!/usr/bin/env python
# -*- coding: utf-8 -*-

from threading import Timer
from time import perf_counter

__all__ = ['Task', 'CountTask']

class Task:
    """
    Run a task asynchronously.

    If interval is specified task is executed periodically.
    If interval is None or 0 task is executed immediately and only once
    """
    def __init__(self, interval, task, logger, task_args=None, task_kwargs=None, end_callback=None):
        """
        Create new task

        Args:
            interval (float): interval to repeat task (in seconds). If None task is executed once
            task (callback): function to call periodically
            logger (logger): logger instance used to log message in task
            task_args (list): list of task parameters
            task_kwargs (dict): dict of task parameters
            end_callback (function): call this function as soon as task is terminated
        """
        self._task = task
        self.logger = logger
        self._args = task_args or []
        self._kwargs = task_kwargs or {}
        self._interval = 0.0 if interval is None else interval
        self.__timer = None
        self._run_count = None
        self.__stopped = False
        self.__end_callback = end_callback
        self.__task_start_timestamp = perf_counter()

    def __run(self):
        """
        Run the task
        """
        # execute task
        if self._run_count is not None:
            self._run_count -= 1

        run_again = False
        try:
            self._task(*self._args, **self._kwargs)

            # launch again the timer if periodic task
            if self._interval:
                if self._run_count is None:
                    # interval specified + run_count is NOT configured
                    run_again = True
                else:
                    # interval specified + run_count is configured
                    if self._run_count > 0:
                        run_again = True
            else:
                # interval not configured, don't run task again
                run_again = False
                self.__timer = None

        except Exception:
            # exception occured
            if self.logger:
                self.logger.exception('Exception occured in task execution:')

        # run again task?
        if run_again and not self.__stopped:
            self.__task_start_timestamp += self._interval
            adjusted_interval = self.__task_start_timestamp - perf_counter()
            self.__timer = Timer(adjusted_interval, self.__run)
            self.__timer.name = 'task-%s' % getattr(self._task, '__name__', 'unamed')
            self.__timer.daemon = True
            self.__timer.start()
        elif self.__end_callback:
            self.__end_callback()

    def wait(self):
        """
        Wait for current task to be done
        """
        if self._run_count is None and not self.__timer:
            self.logger.warning('No task is running')
            return

        if self._run_count is None:
            self.__timer.join()
        else:
            while self._run_count > 0:
                self.__timer.join()

    def start(self):
        """
        Start the task
        """
        # accuracy
        self.__task_start_timestamp = perf_counter()
        if self.__timer:
            self.stop()
        self.__timer = Timer(self._interval, self.__run)
        self.__timer.daemon = True
        self.__timer.name = 'task-%s' % getattr(self._task, '__name__', 'unamed')
        self.__timer.start()

    def stop(self):
        """
        Stop the task
        """
        # cancel timer if it is in waiting stage
        if self.__timer:
            self.__timer.cancel()
            self.__timer = None

        # do not restart timer if task is running
        self.__stopped = True

    def is_running(self):
        """
        Returns True is task is running

        Returns:
            bool: True if running
        """
        return bool(self.__timer and self.__timer.is_alive())


class CountTask(Task):
    """
    Run task X times
    """

    def __init__(self, interval, task, logger, count, task_args=None, task_kwargs=None, end_callback=None):
        """
        Constructor

        Args:
            interval (int): interval to repeat task (in seconds)
            task (function): function to call periodically
            logger (logger): logger instance used to log message in task
            count (int): number of times to run task
            task_args (list): list of task parameters
            task_kwargs (dict): dict of task parameters
            end_callback (function): call this function as soon as task is terminated
        """
        Task.__init__(self, interval, task, logger, task_args, task_kwargs, end_callback)
        self._run_count = count
