#!/usr/bin/env python
# -*- coding: utf-8 -*

import logging
import time
import requests
import re
import datetime

class Raspios():
    """
    Get infos of Raspios releases (desktop and lite version)
    """

    RASPIOS_URL = 'http://downloads.raspberrypi.org/raspios_full_armhf/images/'
    RASPIOS_LITE_URL = 'http://downloads.raspberrypi.org/raspios_lite_armhf/images/'

    def __init__(self, crash_report):
        """
        Constructor
        """
        # members
        self.logger = logging.getLogger(self.__class__.__name__)
        self.crash_report = crash_report

    def __crash_report(self):
        """
        Send crash report
        """
        if self.crash_report:
            self.crash_report.report_exception()

    def get_raspios_release_infos(self, release):
        """
        Parse url specified in latest dict and get infos of release (checksum, link to archive...)

        Args:
            release (dict): release infos as returned by __get_latest_raspios_releases function

        Return:
            dict: raspios and raspios lite infos::
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

        # get release infos
        try:
            self.logger.debug('Requesting %s' % release['url'])
            resp = requests.get(release['url'])
            if resp.status_code==200:
                # parse response content
                matches = re.finditer(r'href=\"(%s.*?)\"' % release['prefix'], resp.text, re.UNICODE)
                for _, match in enumerate(matches):
                    groups = match.groups()
                    self.logger.debug('Groups: %s' % groups)

                    if len(groups)==1:
                        # main archive
                        if groups[0].endswith('.zip'):
                            infos['url'] = '%s%s' % (release['url'], groups[0])
                            infos['timestamp'] = release['timestamp']

                        # sha1 checksum
                        elif groups[0].endswith('.sha1'):
                            url = '%s%s' % (release['url'], groups[0])
                            try:
                                content = requests.get(url)
                                if content.status_code==200:
                                    infos['sha1'] = content.text.split()[0]
                            except:
                                self.__crash_report()
                                self.logger.exception('Exception occured during %s request' % url)

                        # sha256 checksum
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
            self.logger.warning('Cannot get raspios release infos: no internet connection')

        except:
            self.__crash_report()
            self.logger.exception('Exception occured during %s request:' % release['url'])

        return infos

    def get_latest_raspios_releases(self):
        """
        Parse raspios isos releases website and return latest release with it's informations

        Return:
            dict: infos about latest releases::
                {
                    raspios: {
                        prefix (string): prefix string (useful to search items in subfolder)
                        url (string): url of latest archive,
                        timestamp (int): timestamp of latest archive
                    },
                    raspios_lite: {
                        prefix (string): prefix string (useful to search items in subfolder)
                        url (string): url of latest archive,
                        timestamp (int): timestamp of latest archive
                    }
                }
        """
        latest_raspios = None
        latest_raspios_lite = None

        # get latest raspios release infos
        try:
            self.logger.debug('Requesting %s' % self.RASPIOS_URL)
            resp = requests.get(self.RASPIOS_URL)
            if resp.status_code==200:
                # parse response content
                matches = re.finditer(r'href=\"((raspios_full_armhf)-(\d*)-(\d*)-(\d*)/)\"', resp.text, re.UNICODE)
                results = list(matches)
                if len(results)>0:
                    groups = results[-1].groups()
                    if len(groups)==5 and groups[1].startswith('raspios'):
                        dt = datetime.datetime(year=int(groups[2]), month=int(groups[3]), day=int(groups[4]))
                        latest_raspios = {
                            'prefix': '%s' % (groups[2]),
                            'url': '%s%s' % (self.RASPIOS_URL, groups[0]),
                            'timestamp': int(time.mktime(dt.timetuple()))
                        }
            else:
                self.logger.error('Unable to request raspios repository (status code=%d)' % resp.status_code)

        except requests.exceptions.ConnectionError:
            self.logger.warning('Cannot get raspios isos: no internet connection')
        
        except:
            self.__crash_report()
            self.logger.exception('Exception occured during %s read:' % self.RASPIOS_URL)

        # get latest raspios_lite release infos
        try:
            self.logger.debug('Requesting %s' % self.RASPIOS_LITE_URL)
            resp = requests.get(self.RASPIOS_LITE_URL)
            if resp.status_code==200:
                # parse response content
                matches = re.finditer(r'href=\"((raspios_lite_armhf)-(\d*)-(\d*)-(\d*)/)\"', resp.text, re.UNICODE)
                results = list(matches)
                if len(results)>0:
                    groups = results[-1].groups()
                    if len(groups)==5 and groups[1].startswith('raspios'):
                        dt = datetime.datetime(year=int(groups[2]), month=int(groups[3]), day=int(groups[4]))
                        latest_raspios_lite = {
                            'prefix': '%s' % (groups[2]),
                            'url': '%s%s' % (self.RASPIOS_LITE_URL, groups[0]),
                            'timestamp': int(time.mktime(dt.timetuple()))
                        }
                else:
                    self.logger.error('No result requesting %s' % self.RASPIOS_LITE_URL)
            else:
                self.logger.error('Unable to request raspios_lite repository (status code=%d)' % resp.status_code)

        except requests.exceptions.ConnectionError:
            self.logger.warning('Cannot get raspios isos: no internet connection')

        except:
            self.__crash_report()
            self.logger.exception('Exception occured during %s request:' % self.RASPIOS_LITE_URL)

        return {
            'raspios': latest_raspios,
            'raspios_lite': latest_raspios_lite
        }

if __name__=='__main__':
    logging.basicConfig(level=logging.DEBUG)
    from pprint import PrettyPrinter
    pp = PrettyPrinter(indent=2)

    r = Raspios(None)
    releases = r.get_latest_raspios_releases()
    pp.pprint(releases)

    print('*' * 40)
    for release in releases:
        infos = r.get_raspios_release_infos(releases[release])
        pp.pprint(infos)
