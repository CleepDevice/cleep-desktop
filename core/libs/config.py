#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import re
import io
import shutil
import logging

class Config():
    """
    Helper class to read and write any configuration file.
    Give you methods:
     - to get file entries (regexp)
     - to set entry
     - to load and save file content
     - to backup and restore configuration file
    It also ensures to read file content as unicode
    """

    MODE_WRITE = u'w'
    MODE_READ = u'r'
    MODE_APPEND = u'a'

    def __init__(self, path, comment_tag, backup=True):
        """
        Constructor

        Args:
            path (string): configuration file path
            comment_tag (string): comment tag
            backup (bool): auto backup original file (default True)
        """
        self.logger = logging.getLogger(self.__class__.__name__)
        #self.logger.setLevel(logging.DEBUG)
        path = os.path.expanduser(path)
        path = os.path.realpath(path)
        self.path = path
        self.backup_path = self.__get_backup_path(path)
        self.comment_tag = comment_tag
        self.__fd = None

        #backup original file
        if backup:
            self.__make_backup()

    def __del__(self):
        """
        Destructor
        """
        self._close()

    def __make_backup(self):
        """
        Backup original file if necessary
        """
        if not os.path.exists(self.backup_path) and os.path.exists(self.path):
            shutil.copy2(self.path, self.backup_path)

    def restore_backup(self):
        """
        Overwrite original config file by backup one
        """
        if os.path.exists(self.backup_path):
            shutil.copy2(self.backup_path, self.path)
            return True

        return False

    def __get_backup_path(self, path):
        """
        """
        base_path = os.path.dirname(path)
        base, ext = os.path.splitext(path)
        filename = os.path.split(base)[1]
        return os.path.join(base_path, '%s.backup%s' % (filename, ext))

    def _open(self, mode=u'r'):
        """
        Open config file

        Returns:
            file: file descriptor as returned by open() function

        Raises:
            Exception if file doesn't exist
        """
        if not os.path.exists(self.path):
            raise Exception(u'%s file does not exist' % self.path)

        self.__fd = io.open(self.path, mode, encoding=u'utf-8')
        return self.__fd

    def _close(self):
        """
        Close file descriptor is still opened
        """
        if self.__fd:
            self.__fd.close()
            self.__fd = None

    def _write(self, content):
        """
        Write content to config file.
        This function apply automatically remove spaces at end of content

        Args:
            content (string): content to write
        """
        try:
            fd = self._open(self.MODE_WRITE)
            fd.write(content.rstrip())
            self._close()
            return True

        except:
            self.logger.exception('Failed to write config file:')
            return False

    def exists(self):
        """
        Return True if config file exists
        
        Returns:
            bool: True if config file exists
        """
        return os.path.exists(self.path)

    def find(self, pattern, options=re.UNICODE | re.MULTILINE):
        """
        Find all pattern matches in config files. Found order is respected.

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
        fd = self._open()
        content = fd.read()
        self._close()
        matches = re.finditer(pattern, content, options)

        #concat content list if options singleline specified (DOTALL)
        #if re.DOTALL & options:
        #    content = u''.join(content)

        for matchNum, match in enumerate(matches):
            group = match.group().strip()
            if len(group)>0 and len(match.groups())>0:
                #results[group] = match.groups()
                results.append((group, match.groups()))

        return results

    def find_in_string(self, pattern, content, options=re.UNICODE | re.MULTILINE):
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
        results = []
        matches = re.finditer(pattern, content, options)

        for matchNum, match in enumerate(matches):
            group = match.group().strip()
            if len(group)>0 and len(match.groups())>0:
                #results[group] = match.groups()
                results.append((group, match.groups()))

        return results
   

    def uncomment(self, comment):
        """
        Uncomment specified line

        Args:
            comment (string): full line to search and uncomment

        Returns:
            bool: True if line commented
        """
        if self.comment_tag is None:
            #no way to add comment
            return False
        if not comment.startswith(self.comment_tag):
            #line already uncommented
            return False

        #read file content
        fd = self._open()
        lines = fd.readlines()
        self._close()

        #get line indexes to remove
        found = False
        index = 0
        for line in lines:
            if line.strip()==comment.strip():
                found = True
                lines[index] = lines[index][len(self.comment_tag):]
                break
            index += 1

        if found:
            #write config file
            return self._write(u''.join(lines))

        return False

    def comment(self, comment):
        """
        Comment specified line

        Args:
            comment (string): full line to search and comment

        Returns:
            bool: True if line commented
        """
        if self.comment_tag is None:
            #no way to add comment
            return False
        if comment.startswith(self.comment_tag):
            #line already commented
            return False

        #read file content
        fd = self._open()
        lines = fd.readlines()
        self._close()

        #get line indexes to remove
        found = False
        index = 0
        for line in lines:
            if line.strip()==comment.strip():
                found = True
                lines[index] = u'%s%s' % (self.comment_tag, lines[index])
                break
            index += 1

        if found:
            #write config file
            return self._write(u''.join(lines))

        return False

    def remove(self, content):
        """
        Remove specified content (must be exactly the same string!)

        Args:
            content (string): string to remove

        Returns:
            bool: True if content removed
        """
        #check params
        if not isinstance(content, unicode):
            raise Exception('Content parameter must be unicode')

        fd = self._open()
        lines = fd.read()
        self._close()

        #remove content
        before = len(lines)
        lines = lines.replace(content, '')
        after = len(lines)

        if before!=after:
            #write config file
            return self._write(u''.join(lines))
            
        return False

    def remove_lines(self, removes):
        """
        Remove specified lines

        Args:
            removes (list): list of lines to remove. Line must be exactly the same

        Returns:
            bool: True if at least one line removed, False otherwise
        """
        #check params
        if not isinstance(removes, list):
            raise Exception('Removes parameter must be list of string')

        fd = self._open()
        lines = fd.readlines()
        self._close()

        #get line indexes to remove
        indexes = []
        for remove in removes:
            index = 0
            for line in lines:
                if line.strip()==remove.strip():
                    indexes.append(index)
                    break
                index += 1

        #delete lines
        indexes.sort()
        indexes.reverse()
        for index in indexes:
            lines.pop(index)

        if len(indexes)>0:
            #write config file
            return self._write(u''.join(lines))

        return False

    def remove_pattern(self, line_regexp):
        """
        Remove specified line pattern

        Args:
            line_regexp (pattern): regexp line pattern

        Return:
            int: number of lines removed
        """
        #read content
        fd = self._open()
        lines = fd.readlines()
        self._close()

        #remove line
        count = 0
        indexes = []
        index = 0
        for line in lines:
            if re.match(line_regexp, line):
                indexes.append(index)
                count += 1

            index += 1

        #delete lines
        indexes.sort()
        indexes.reverse()
        for index in indexes:
            lines.pop(index)

        #write config file
        if len(indexes)>0:
            #write config file
            if self._write(u''.join(lines)):
                return count
            else:
                return 0
                
        return count

    def remove_after(self, header_regexp, line_regexp, lines_to_delete):
        """
        Remove line matching pattern after header pattern

        Args:
            header_pattern (pattern): regexp header pattern
            line_pattern (pattern): regexp line pattern
            lines_to_delete (int): number of lines to delete

        Returns:
            int: number of lines deleted (blank and commented lines not counted)
        """
        #read content
        fd = self._open()
        lines = fd.readlines()
        self._close()

        #get line indexes to remove
        start = False
        indexes = []
        index = 0
        count = 0
        for line in lines:
            if re.match(header_regexp, line):
                #header found, start
                indexes.append(index)
                start = True
                count += 1
            elif count==lines_to_delete:
                #number of line to delete reached, stop
                break
            elif start and self.comment_tag is not None and line.strip().startswith(self.comment_tag):
                #commented line
                continue
            elif start and re.match(line_regexp, line):
                #save index of line to delete
                indexes.append(index)
                count += 1
            index += 1

        #delete lines
        indexes.sort()
        indexes.reverse()
        for index in indexes:
            lines.pop(index)

        #write config file
        if len(indexes)>0:
            #write config file
            if self._write(u''.join(lines)):
                return count
            else:
                return 0

        return count
        
    def add_lines(self, lines):
        """
        Add new lines at end of file

        Args:
            lines (list): list of lines to add

        Return:
            bool: True if succeed
        """
        #check params
        if not isinstance(lines, list):
            raise Exception('Lines parameter must be list of string')

        #read content
        fd = self._open()
        content = fd.readlines()
        self._close()

        #add new line
        if len(lines[len(lines)-1])!=0:
            content.append(u'\n')
        for line in lines:
            content.append(line)

        #write config file
        return self._write(u''.join(content))

    def add(self, content):
        """
        Add specified content at end of file

        Args:
            content (string): string to append

        Returns:
            bool: True if content added
        """
        #check params
        if not isinstance(content, unicode):
            raise Exception('Lines parameter must be list of string')

        #read content
        fd = self._open()
        content_ = fd.read()
        self._close()

        #add new content
        content_ += content

        #write config file
        return self._write(content_)

    def get_content(self):
        """
        Get config file content

        Returns:
            list: list of lines
        """
        #read content
        fd = self._open()
        lines = fd.readlines()
        self._close()
        
        return lines

    def dump(self): # pragma: no cover
        """
        Dump file content to stdout
        For debug and test purpose only
        """
        #read content
        fd = self._open()
        lines = fd.readlines()
        self._close()

        #print lines
        print(u''.join(lines))


