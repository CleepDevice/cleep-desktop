#!/usr/bin/env python
# -*- coding: utf-8 -*-
   
import binascii
from passlib.utils import pbkdf2
import base64
import io
import os
import logging
import sys
import subprocess
import platform

# from https://elinux.org/RPi_HardwareHistory
RASPBERRY_PI_REVISIONS = {
    u'unknown':{u'date': u'?',        u'model': u'?',                                u'pcbrevision': u'?',   u'ethernet': False, u'wireless': False, u'audio':False, u'gpiopins': 0,  u'memory': '?',              u'notes': u'Unknown model'},
    u'0002':   {u'date': u'Q1 2012',  u'model': u'B',                                u'pcbrevision': u'1.0', u'ethernet': True,  u'wireless': False, u'audio': True, u'gpiopins': 26, u'memory': u'256 MB',        u'notes': u''},
    u'0003':   {u'date': u'Q3 2012',  u'model': u'B (ECN0001)',                      u'pcbrevision': u'1.0', u'ethernet': True,  u'wireless': False, u'audio': True, u'gpiopins': 26, u'memory': u'256 MB',        u'notes': u'Fuses mod and D14 removed'},
    u'0004':   {u'date': u'Q3 2012',  u'model': u'B',                                u'pcbrevision': u'2.0', u'ethernet': True,  u'wireless': False, u'audio': True, u'gpiopins': 26, u'memory': u'256 MB',        u'notes': u'(Mfg by Sony)'},
    u'0005':   {u'date': u'Q4 2012',  u'model': u'B',                                u'pcbrevision': u'2.0', u'ethernet': True,  u'wireless': False, u'audio': True, u'gpiopins': 26, u'memory': u'256 MB',        u'notes': u'(Mfg by Qisda)'},
    u'0006':   {u'date': u'Q4 2012',  u'model': u'B',                                u'pcbrevision': u'2.0', u'ethernet': True,  u'wireless': False, u'audio': True, u'gpiopins': 26, u'memory': u'256 MB',        u'notes': u'(Mfg by Egoman)'},
    u'0007':   {u'date': u'Q1 2013',  u'model': u'A',                                u'pcbrevision': u'2.0', u'ethernet': False, u'wireless': False, u'audio': True, u'gpiopins': 26, u'memory': u'256 MB',        u'notes': u'(Mfg by Egoman)'},
    u'0008':   {u'date': u'Q1 2013',  u'model': u'A',                                u'pcbrevision': u'2.0', u'ethernet': False, u'wireless': False, u'audio': True, u'gpiopins': 26, u'memory': u'256 MB',        u'notes': u'(Mfg by Sony)'},
    u'0009':   {u'date': u'Q1 2013',  u'model': u'A',                                u'pcbrevision': u'2.0', u'ethernet': False, u'wireless': False, u'audio': True, u'gpiopins': 26, u'memory': u'256 MB',        u'notes': u'(Mfg by Qisda)'},
    u'000d':   {u'date': u'Q4 2012',  u'model': u'B',                                u'pcbrevision': u'2.0', u'ethernet': True,  u'wireless': False, u'audio': True, u'gpiopins': 26, u'memory': u'512 MB',        u'notes': u'(Mfg by Egoman)'},
    u'000e':   {u'date': u'Q4 2012',  u'model': u'B',                                u'pcbrevision': u'2.0', u'ethernet': True,  u'wireless': False, u'audio': True, u'gpiopins': 26, u'memory': u'512 MB',        u'notes': u'(Mfg by Sony)'},
    u'000f':   {u'date': u'Q4 2012',  u'model': u'B',                                u'pcbrevision': u'2.0', u'ethernet': True,  u'wireless': False, u'audio': True, u'gpiopins': 26, u'memory': u'512 MB',        u'notes': u'(Mfg by Qisda)'},
    u'0010':   {u'date': u'Q3 2014',  u'model': u'B+',                               u'pcbrevision': u'1.0', u'ethernet': True,  u'wireless': False, u'audio': True, u'gpiopins': 40, u'memory': u'512 MB',        u'notes': u'(Mfg by Sony)'},
    u'0011':   {u'date': u'Q2 2014',  u'model': u'Compute Module 1',                 u'pcbrevision': u'1.0', u'ethernet': False, u'wireless': False, u'audio': True, u'gpiopins': 0,  u'memory': u'512 MB',        u'notes': u'(Mfg by Sony)'},
    u'0012':   {u'date': u'Q4 2014',  u'model': u'A+',                               u'pcbrevision': u'1.1', u'ethernet': False, u'wireless': False, u'audio': True, u'gpiopins': 40, u'memory': u'256 MB',        u'notes': u'(Mfg by Sony)'},
    u'0013':   {u'date': u'Q1 2015',  u'model': u'B+',                               u'pcbrevision': u'1.2', u'ethernet': True,  u'wireless': False, u'audio': True, u'gpiopins': 40, u'memory': u'512 MB',        u'notes': u'(Mfg by Embest)'},
    u'0014':   {u'date': u'Q2 2014',  u'model': u'Compute Module 1',                 u'pcbrevision': u'1.0', u'ethernet': False, u'wireless': False, u'audio': True, u'gpiopins': 0 , u'memory': u'512 MB',        u'notes': u'(Mfg by Embest)'},
    u'0015':   {u'date': u'?',        u'model': u'A+',                               u'pcbrevision': u'1.1', u'ethernet': False, u'wireless': False, u'audio': True, u'gpiopins': 40, u'memory': u'256 MB/512 MB', u'notes': u'(Mfg by Embest)'},
    u'a01040': {u'date': u'Unknown',  u'model': u'2 Model B',                        u'pcbrevision': u'1.0', u'ethernet': True,  u'wireless': False, u'audio': True, u'gpiopins': 40, u'memory': u'1 GB',          u'notes': u'(Mfg by Sony)'},
    u'a01041': {u'date': u'Q1 2015',  u'model': u'2 Model B',                        u'pcbrevision': u'1.1', u'ethernet': True,  u'wireless': False, u'audio': True, u'gpiopins': 40, u'memory': u'1 GB',          u'notes': u'(Mfg by Sony)'},
    u'a21041': {u'date': u'Q1 2015',  u'model': u'2 Model B',                        u'pcbrevision': u'1.1', u'ethernet': True,  u'wireless': False, u'audio': True, u'gpiopins': 40, u'memory': u'1 GB',          u'notes': u'(Mfg by Embest)'},
    u'a22042': {u'date': u'Q3 2016',  u'model': u'2 Model B (with BCM2837)',         u'pcbrevision': u'1.2', u'ethernet': True,  u'wireless': False, u'audio': True, u'gpiopins': 40, u'memory': u'1 GB',          u'notes': u'(Mfg by Embest)'},
    u'900021': {u'date': u'Q3 2016',  u'model': u'A+',                               u'pcbrevision': u'1.1', u'ethernet': False, u'wireless': False, u'audio': True, u'gpiopins': 40, u'memory': u'512 MB',        u'notes': u'(Mfg by Sony)'},
    u'900032': {u'date': u'Q2 2016?', u'model': u'B+',                               u'pcbrevision': u'1.2', u'ethernet': True,  u'wireless': False, u'audio': True, u'gpiopins': 40, u'memory': u'512 MB',        u'notes': u'(Mfg by Sony)'},
    u'900092': {u'date': u'Q4 2015',  u'model': u'Zero',                             u'pcbrevision': u'1.2', u'ethernet': False, u'wireless': False, u'audio': False, u'gpiopins': 40, u'memory': u'512 MB',        u'notes': u'(Mfg by Sony)'},
    u'900093': {u'date': u'Q2 2016',  u'model': u'Zero',                             u'pcbrevision': u'1.3', u'ethernet': False, u'wireless': False, u'audio': False, u'gpiopins': 40, u'memory': u'512 MB',        u'notes': u'(Mfg by Sony)'},
    u'920093': {u'date': u'Q4 2016?', u'model': u'Zero',                             u'pcbrevision': u'1.3', u'ethernet': False, u'wireless': False, u'audio': False, u'gpiopins': 40, u'memory': u'512 MB',        u'notes': u'(Mfg by Embest)'},
    u'9000c1': {u'date': u'Q1 2017',  u'model': u'Zero W',                           u'pcbrevision': u'1.1', u'ethernet': False, u'wireless': True,  u'audio': False, u'gpiopins': 40, u'memory': u'512 MB',        u'notes': u'(Mfg by Sony)'},
    u'a02082': {u'date': u'Q1 2016',  u'model': u'3 Model B',                        u'pcbrevision': u'1.2', u'ethernet': True,  u'wireless': True,  u'audio': True, u'gpiopins': 40, u'memory': u'1 GB',          u'notes': u'(Mfg by Sony)'},
    u'a020a0': {u'date': u'Q1 2017',  u'model': u'Compute Module 3 (and CM3 Lite)',  u'pcbrevision': u'1.0', u'ethernet': False, u'wireless': False, u'audio': True, u'gpiopins': 0,  u'memory': u'1 GB',          u'notes': u'(Mfg by Sony)'},
    u'a22082': {u'date': u'Q1 2016',  u'model': u'3 Model B',                        u'pcbrevision': u'1.2', u'ethernet': True,  u'wireless': True,  u'audio': True, u'gpiopins': 40, u'memory': u'1 GB',          u'notes': u'(Mfg by Embest)'},
    u'a32082': {u'date': u'Q4 2016',  u'model': u'3 Model B',                        u'pcbrevision': u'1.2', u'ethernet': True,  u'wireless': True,  u'audio': True, u'gpiopins': 40, u'memory': u'1 GB',          u'notes': u'(Mfg by Sony Japan)'},
    u'a020d3': {u'date': u'Q1 2018',  u'model': u'3 Model B+',                       u'pcbrevision': u'1.3', u'ethernet': True,  u'wireless': True,  u'audio': True, u'gpiopins': 40, u'memory': u'1 GB',          u'notes': u'(Mfg by Sony)'},
    u'9020e0': {u'date': u'Q4 2018',  u'model': u'3 Model A+',                       u'pcbrevision': u'1.0', u'ethernet': False, u'wireless': True,  u'audio': True, u'gpiopins': 40, u'memory': u'512 MB',        u'notes': u'(Mfg by Sony)'},
    u'a03111': {u'date': u'Q2 2019',  u'model': u'4 Model B',                        u'pcbrevision': u'1.1', u'ethernet': True,  u'wireless': True,  u'audio': True, u'gpiopins': 40, u'memory': u'1 GB',          u'notes': u'(Mfg by Sony)'},
    u'b03111': {u'date': u'Q2 2019',  u'model': u'4 Model B',                        u'pcbrevision': u'1.1', u'ethernet': True,  u'wireless': True,  u'audio': True, u'gpiopins': 40, u'memory': u'2 GB',          u'notes': u'(Mfg by Sony)'},
    u'c03111': {u'date': u'Q2 2019',  u'model': u'4 Model B',                        u'pcbrevision': u'1.1', u'ethernet': True,  u'wireless': True,  u'audio': True, u'gpiopins': 40, u'memory': u'4 GB',          u'notes': u'(Mfg by Sony)'},
}

def raspberry_pi_infos():
    """
    Returns infos about current raspberry pi board

    Note:
        https://elinux.org/RPi_HardwareHistory#Board_Revision_History

    Returns:
        dict: raspberry pi board infos::

            {
                date (string): release date
                model (string): raspberry pi model
                pcbrevision (string): PCB revision
                ethernet (bool): True if ethernet is natively available on board
                wireless (bool): True if wifi is natively available on board,
                audio (bool): True if audio is natively available on board
                gpiopins (int): number of pins available on board
                memory (string): memory amount
                notes (string): notes on board
                revision (string): raspberry pi revision
            }

    """
    if not platform.machine().startwith('arm'):
        raise Exception('Not arm platform')
    cmd = u'/usr/bin/awk \'/^Revision/ {sub("^1000", "", $3); print $3}\' /proc/cpuinfo'
    p = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE)
    revision = p.communicate()[0].decode('utf-8').replace(u'\n', u'')
    logging.trace('Raspberrypi revision=%s' % revision)
    infos = RASPBERRY_PI_REVISIONS[revision] if revision and revision in RASPBERRY_PI_REVISIONS else RASPBERRY_PI_REVISIONS[u'unknown']
    infos[u'revision'] = revision

    return infos

TRACE = logging.DEBUG - 5
        
def install_trace_logging_level():
    """ 
    Install custom log level TRACE for library debugging principaly
    Credits https://gist.github.com/numberoverzero/f803ebf29a0677b6980a5a733a10ca71
    """
    level = logging.TRACE = TRACE 

    def log_logger(self, message, *args, **kwargs):
        if self.isEnabledFor(level):
            self._log(level, message, args, **kwargs)
    logging.getLoggerClass().trace = log_logger

    def log_root(msg, *args, **kwargs):
        logging.log(level, msg, *args, **kwargs)
    logging.addLevelName(level, "TRACE")
    logging.trace = log_root

def install_unhandled_exception_handler(crash_report): # pragma: no cover (can test it)
    """
    Overwrite default exception handler to log errors
    @see https://stackoverflow.com/a/16993115

    Args:
        crash_report (CrashReport): crash report instance
    """
    def handle_exception(exc_type, exc_value, exc_traceback):
        sys.__excepthook__(exc_type, exc_value, exc_traceback)
        if issubclass(exc_type, KeyboardInterrupt):
            return
        if crash_report:
            crash_report.report_exception()
        logging.error('Uncaught exception', exc_info=(exc_type, exc_value, exc_traceback))

    sys.excepthook = handle_exception

DBM_TO_PERCENT = {
    -1:100, -2:100, -3:100, -4:100, -5:100, -6:100, -7:100, -8:100, -9:100, -10:100, -11:100, -12:100, -13:100, -14:100,
    -15:100, -16:100, -17:100, -18:100, -19:100, -20:100, -21:99, -22:99, -23:99, -24:98, -25:98, -26:98, -27:97, -28:97,
    -29:96, -30:96, -31:95, -32:95, -33:94, -34:93, -35:93, -36:92, -37:91, -38:90, -39:90, -40:89, -41:88, -42:87, -43:86,
    -44:85, -45:84, -46:83, -47:82, -48:81, -49:80, -50:79, -51:78, -52:76, -53:75, -54:74, -55:73, -56:71, -57:70, -58:69,
    -59:67, -60:66, -61:64, -62:63, -63:61, -64:60, -65:58, -66:56, -67:55, -68:53, -69:51, -70:50, -71:48, -72:46, -73:44,
    -74:42, -75:40, -76:38, -77:36, -78:34, -79:32, -80:30, -81:28, -82:26, -83:24, -84:22, -85:20, -86:17, -87:15, -88:13,
    -89:10, -90:8, -91:6, -92:3, -93:1, -94:1, -95:1, -96:1, -97:1, -98:1, -99:1, -100:1}

def dbm_to_percent(dbm):
    """
    Convert dbm signal level to percentage

    Note:
        Article here https://www.adriangranados.com/blog/dbm-to-percent-conversion

    Args:
        dbm (int): dbm value

    Returns:
        int: percentage value
    """
    if dbm in DBM_TO_PERCENT.keys():
        return DBM_TO_PERCENT[dbm]

    return 0

def wpa_passphrase(ssid, password):
    """
    Python implementation of wpa_passphrase linux utility
    It generates wpa_passphrase for wifi network connection

    Note:
        Copied from https://github.com/julianofischer/python-wpa-psk-rawkey-gen/blob/master/rawkey-generator.py

    Args:
        ssid (string): network ssid
        password (string): password

    Returns:
        string: generated psk
    """
    psk = pbkdf2.pbkdf2(str.encode(password), str.encode(ssid), 4096, 32)
    return binascii.hexlify(psk).decode("utf-8")

def file_to_base64(path):
    """
    Convert specified file to base64 string

    Args:
        path (string): path to file

    Returns:
        string: base64 encoded file content

    Raises:
        Exception of all kind if something wrong occured
    """
    with io.open(path, u'rb') as file_to_convert:
        return base64.b64encode(file_to_convert.read()).decode('utf-8')

def hr_uptime(uptime):
    """  
    Human readable uptime (in days/hours/minutes/seconds)

    Note:
        http://unix.stackexchange.com/a/27014

    Args:
        uptime (int): uptime value

    Returns:
        string: human readable string
    """
    # get values
    days = uptime / 60 / 60 / 24 
    hours = uptime / 60 / 60 % 24 
    minutes = uptime / 60 % 60 

    return u'%dd %dh %dm' % (days, hours, minutes)

def hr_bytes(n):
    """  
    Human readable bytes value

    Note:
        http://code.activestate.com/recipes/578019

    Args:
        n (int): bytes

    Returns:
        string: human readable bytes value
    """
    symbols = (u'K', u'M', u'G', u'T', u'P', u'E', u'Z', u'Y')
    prefix = {} 

    for i, s in enumerate(symbols):
        prefix[s] = 1 << (i + 1) * 10 

    for s in reversed(symbols):
        if n >= prefix[s]:
            value = float(n) / prefix[s]
            return u'%.1f%s' % (value, s)

    return u'%sB' % n

def compare_versions(old_version, new_version):
    """ 
    Compare specified version and return True if new version is strictly greater than old one

    Args:
        old_version (string): old version
        new_version (string): new version

    Returns:
        bool: True if new version available
    """
    # check versions
    old_vers = tuple(map(int, (old_version.split(u'.'))))
    if len(old_vers)!=3:
        raise Exception('Invalid version "%s" format, only 3 digits format allowed' % old_version)

    new_vers = tuple(map(int, (new_version.split(u'.'))))
    if len(new_vers)!=3:
        raise Exception('Invalid version "%s" format, only 3 digits format allowed' % new_version)

    # compare version
    if old_vers<new_vers:
        return True

    return False

def full_split_path(path):
    """
    Split path completely /home/test/test.txt => ['/', 'home', 'test', 'test.py']

    Note:
        code from https://www.safaribooksonline.com/library/view/python-cookbook/0596001673/ch04s16.html

    Returns:
        list: list of path parts
    """
    allparts = []
    while 1:
        parts = os.path.split(path)
        if parts[0] == path:  # sentinel for absolute paths
            allparts.insert(0, parts[0])
            break
        elif parts[1] == path: # sentinel for relative paths
            allparts.insert(0, parts[1])
            break
        else:
            path = parts[0]
            allparts.insert(0, parts[1])
    
    return list(filter(lambda p: len(p)>0, allparts))

def netmask_to_cidr(netmask):
    """ 
    Convert netmask to cidr format

    Note:
        code from https://stackoverflow.com/a/43885814

    Args:
        netmask (string): netmask address

    Returns:
        int: cidr value
    """
    return sum([bin(int(x)).count('1') for x in netmask.split('.')])

def cidr_to_netmask(cidr):
    """
    Convert cidr to netmask

    Note:
        http://www.linuxquestions.org/questions/blog/bittner-195120/cidr-to-netmask-conversion-with-python-convert-short-netmask-to-long-dotted-format-3147/

    Args:
        cidr (int): cidr value

    Returns:
        string: netmask (ie 255.255.255.0)
    """
    mask = ''
    if not isinstance(cidr, int) or cidr<0 or cidr>32: # pragma: no cover
            return None
    
    for t in range(4):
        if cidr > 7:
            mask += '255.'
        else:
            dec = 255 - (2**(8 - cidr) - 1)
            mask += str(dec) + '.' 
        cidr -= 8
        if cidr < 0:
            cidr = 0 
    
    return mask[:-1]
