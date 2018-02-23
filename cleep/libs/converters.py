#!/usr/bin/env python
# -*- coding: utf-8 -*-
   
import binascii
from passlib.utils import pbkdf2
import base64
import io

DBM_TO_PERCENT = {-1:100, -2:100, -3:100, -4:100, -5:100, -6:100, -7:100, -8:100, -9:100, -10:100, -11:100, -12:100, -13:100, -14:100, -15:100, -16:100, -17:100, -18:100, -19:100, -20:100, -21:99, -22:99, -23:99, -24:98, -25:98, -26:98, -27:97, -28:97, -29:96, -30:96, -31:95, -32:95, -33:94, -34:93, -35:93, -36:92, -37:91, -38:90, -39:90, -40:89, -41:88, -42:87, -43:86, -44:85, -45:84, -46:83, -47:82, -48:81, -49:80, -50:79, -51:78, -52:76, -53:75, -54:74, -55:73, -56:71, -57:70, -58:69, -59:67, -60:66, -61:64, -62:63, -63:61, -64:60, -65:58, -66:56, -67:55, -68:53, -69:51, -70:50, -71:48, -72:46, -73:44, -74:42, -75:40, -76:38, -77:36, -78:34, -79:32, -80:30, -81:28, -82:26, -83:24, -84:22, -85:20, -86:17, -87:15, -88:13, -89:10, -90:8, -91:6, -92:3, -93:1, -94:1, -95:1, -96:1, -97:1, -98:1, -99:1, -100:1}

def dbm_to_percent(dbm):
    """
    Convert dbm signal level to percentage

    Note:
        Article here https://www.adriangranados.com/blog/dbm-to-percent-conversion

    Args:
        dbm (int): dbm value

    Return:
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

    Return:
        string: generated psk
    """
    psk = pbkdf2.pbkdf2(str.encode(password), str.encode(ssid), 4096, 32)
    return binascii.hexlify(psk).decode("utf-8")

def file_to_base64(path):
    """
    Convert specified file to base64 string

    Args:
        path (string): path to file

    Return:
        string: base64 encoded file content
    """
    with io.open(path, u'rb') as file_to_convert:
        return base64.b64encode(file_to_convert.read())


