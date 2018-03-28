#!/usr/bin/env python
# -*- coding: utf-8 -*

import logging
import time
import requests
import re
import datetime

class Raspbians():
    """
    Get infos of Raspbians releases (desktop and lite version)
    """

    RASPBIAN_URL = 'http://downloads.raspberrypi.org/raspbian/images/'
    RASPBIAN_LITE_URL = 'http://downloads.raspberrypi.org/raspbian_lite/images/'

    def __init__(self, crash_report):
        """
        Constructor
        """
        #members
        self.logger = logging.getLogger(self.__class__.__name__)
        self.crash_report = crash_report

    def __crash_report(self):
        """
        Send crash report
        """
        if self.crash_report:
            self.crash_report.report_exception()

    def get_raspbian_release_infos(self, release):
        """
        Parse url specified in latest dict and get infos of release (checksum, link to archive...)

        Args:
            release (dict): release infos as returned by __get_latest_raspbian_releases function

        Return:
            dict: raspbian and raspbian lite infos::
                {
                    url (string): file url
                    sha1 (string): sha1 checksum
                    sha256 (string): sha256 checksum,
                    timestamp (int): datetime of release
                }
        """
        infos = {
            'url': None,
            'sha1': None,
            'sha256': None,
            'timestamp': None
        }

        #get release infos
        try:
            self.logger.debug('Requesting %s' % release['url'])
            resp = requests.get(release['url'])
            if resp.status_code==200:
                #self.logger.debug('Resp content: %s' % resp.text)
                #parse response content
                matches = re.finditer(r'href=\"(%s.*?)\"' % release['prefix'], resp.text, re.UNICODE)
                for matchNum, match in enumerate(matches):
                    groups = match.groups()
                    self.logger.debug('Groups: %s' % groups)

                    if len(groups)==1:
                        #main archive
                        if groups[0].endswith('.zip'):
                            infos['url'] = '%s%s' % (release['url'], groups[0])
                            infos['timestamp'] = release['timestamp']

                        #sha1 checksum
                        elif groups[0].endswith('.sha1'):
                            url = '%s%s' % (release['url'], groups[0])
                            try:
                                content = requests.get(url)
                                if content.status_code==200:
                                    infos['sha1'] = content.text.split()[0]
                            except:
                                self.__crash_report()
                                self.logger.exception('Exception occured during %s request' % url)

                        #sha256 checksum
                        elif groups[0].endswith('.sha256'):
                            url = '%s%s' % (release['url'], groups[0])
                            try:
                                content = requests.get(url)
                                if content.status_code==200:
                                    infos['sha256'] = content.text.split()[0]
                            except:
                                self.__crash_report()
                                self.logger.exception('Exception occured during %s request' % url)

            else:
                self.logger.error('Request %s failed (status code=%d)' % (release['url'], resp.status_code))

        except requests.exceptions.ConnectionError:
            self.logger.warning('Cannot get raspbians release infos: no internet connection')

        except:
            self.__crash_report()
            self.logger.exception('Exception occured during %s request:' % release['url'])

        return infos

    def get_latest_raspbian_releases(self):
        """
        Parse raspbian isos releases website and return latest release with it's informations

        Return:
            dict: infos about latest releases::
                {
                    raspbian: {
                        prefix (string): prefix string (useful to search items in subfolder)
                        url (string): url of latest archive,
                        timestamp (int): timestamp of latest archive
                    },
                    raspbian_lite: {
                        prefix (string): prefix string (useful to search items in subfolder)
                        url (string): url of latest archive,
                        timestamp (int): timestamp of latest archive
                    }
                }
        """
        latest_raspbian = None
        latest_raspbian_lite = None

        #get latest raspbian release infos
        try:
            self.logger.debug('Requesting %s' % self.RASPBIAN_URL)
            resp = requests.get(self.RASPBIAN_URL)
            if resp.status_code==200:
                #parse response content
                matches = re.finditer(r'href=\"((raspbian)-(\d*)-(\d*)-(\d*)/)\"', resp.text, re.UNICODE)
                results = list(matches)
                if len(results)>0:
                    groups = results[-1].groups()
                    if len(groups)==5 and groups[1]=='raspbian':
                        dt = datetime.datetime(year=int(groups[2]), month=int(groups[3]), day=int(groups[4]))
                        latest_raspbian = {
                            'prefix': '%s' % (groups[2]),
                            'url': '%s%s' % (self.RASPBIAN_URL, groups[0]),
                            'timestamp': int(time.mktime(dt.timetuple()))
                        }
            else:
                self.logger.error('Unable to request raspbian repository (status code=%d)' % resp.status_code)

        except requests.exceptions.ConnectionError:
            self.logger.warning('Cannot get raspbians isos: no internet connection')
        
        except:
            self.__crash_report()
            self.logger.exception('Exception occured during %s read:' % self.RASPBIAN_URL)

        #get latest raspbian_lite release infos
        try:
            self.logger.debug('Requesting %s' % self.RASPBIAN_LITE_URL)
            resp = requests.get(self.RASPBIAN_LITE_URL)
            if resp.status_code==200:
                #parse response content
                matches = re.finditer(r'href=\"((raspbian_lite)-(\d*)-(\d*)-(\d*)/)\"', resp.text, re.UNICODE)
                results = list(matches)
                if len(results)>0:
                    groups = results[-1].groups()
                    if len(groups)==5 and groups[1]=='raspbian_lite':
                        dt = datetime.datetime(year=int(groups[2]), month=int(groups[3]), day=int(groups[4]))
                        latest_raspbian_lite = {
                            'prefix': '%s' % (groups[2]),
                            'url': '%s%s' % (self.RASPBIAN_LITE_URL, groups[0]),
                            'timestamp': int(time.mktime(dt.timetuple()))
                        }
                else:
                    self.logger.error('No result requesting %s' % self.RASPBIAN_LITE_URL)
            else:
                self.logger.error('Unable to request raspbian_lite repository (status code=%d)' % resp.status_code)

        except requests.exceptions.ConnectionError:
            self.logger.warning('Cannot get raspbians isos: no internet connection')

        except:
            self.__crash_report()
            self.logger.exception('Exception occured during %s request:' % self.RASPBIAN_LITE_URL)

        return {
            'raspbian': latest_raspbian,
            'raspbian_lite': latest_raspbian_lite
        }

if __name__=='__main__':
    logging.basicConfig(level=logging.DEBUG)
    from pprint import PrettyPrinter
    pp = PrettyPrinter(indent=2)

    r = Raspbians(None)
    releases = r.get_latest_raspbian_releases()
    pp.pprint(releases)

    print('*' * 40)
    for release in releases:
        infos = r.get_raspbian_release_infos(releases[release])
        pp.pprint(infos)