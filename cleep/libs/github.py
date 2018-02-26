#!/usr/bin/env python
# -*- coding: utf-8 -*

import logging
import time
import urllib3
import json

class Github():
    """
    Github release helper
    This class get releases from specified project and return content as dict
    """

    GITHUB_RELEASES = u'https://api.github.com/repos/%s/%s/releases'
    GITHUB_RELEASES_TAG = GITHUB_RELEASES + u'/tags/%s'
    GITHUB_RELEASES_LATEST = GITHUB_RELEASES + u'/latest'

    def __init__(self, owner, repository):
        """
        Constructor

        Args:
            owner (string): name of repository owner
            repository (string): name of repository
        """
        #logger
        self.logger = logging.getLogger(self.__class__.__name__)
        #self.logger.setLevel(logging.DEBUG)

        #members
        self.http_headers =  {'user-agent':'Mozilla/5.0 (Windows NT 6.3; rv:36.0) Gecko/20100101 Firefox/36.0'}
        self.http = urllib3.PoolManager(num_pools=1)
        self.owner = owner
        self.repository = repository

    def get_release_version(self, release):
        """
        Return version of specified release

        Args:
            release (dict): release data as returned by get_releases function

        Return:
            string: version of release
        """
        if not isinstance(release, dict):
            raise Exception('Invalid release format. Dict type awaited')

        if u'tag_name' in release.keys():
            return release[u'tag_name']
        else:
            raise Exception('Specified release has no version field')

    def get_release_assets_infos(self, release):
        """
        Return simplified structure of all release assets

        Args:
            release (dict): release data as returned by get_releases function

        Return:
            list of dict: list of assets infos (name, url, size)::
                [
                    {name (string), url (string), size (int)},
                    {name (string), url (string), size (int)},
                    ...
                ]
        """
        if not isinstance(release, dict):
            raise Exception(u'Invalid release format. Dict type awaited')
        if u'assets' not in release.keys():
            raise Exception(u'Invalid release format.')

        out = []
        for asset in release[u'assets']:
            if u'browser_download_url' and u'size' and u'name' in asset.keys():
                out.append({
                    u'name': asset[u'name'],
                    u'url': asset[u'browser_download_url'],
                    u'size': asset[u'size']
                })

        return out

    def __request_github(self, url):
        """
        Request github

        Args:
            url (string): url to request

        Return:
            dict: data or None if bad response

        Raises:
            Exception
        """
        #request url
        resp = self.http.urlopen('GET', url, headers=self.http_headers)
        if resp.status==200:
            #response successful, parse data to get current latest version
            data = json.loads(resp.data.decode('utf-8'))
            self.logger.debug('Data: %s' % data)
            return data

        elif resp.status==404:
            raise Exception(u'Invalid request: not found')

        else:
            #invalid request
            raise Exception(u'Invalid response from %s: status=%s data=%s' % (url, resp.status, resp.data))

    def get_releases(self):
        """
        Get all releases of specify project repository

        Return:
            list: list of releases. Format can be found here https://developer.github.com/v3/repos/releases/
        """
        #get url
        url = self.GITHUB_RELEASES % (self.owner, self.repository)
            
        #request
        data = self.__request_github(url)
        if len(data)==0:
            #no release yet?
            return []
        else:
            return data

    def get_release(self, tag_name):
        """
        Get release according to specified tag name

        Args:
            tag_name (string): tag name
        """
        #get url
        url = self.GITHUB_RELEASES_TAG % (self.owner, self.repository, tag_name)
            
        #request
        return self.__request_github(url)

    def get_latest_release(self):
        """
        Return latest release
        """
        #get url
        url = self.GITHUB_RELEASES_LATEST % (self.owner, self.repository)
            
        #request
        return self.__request_github(url)
    

