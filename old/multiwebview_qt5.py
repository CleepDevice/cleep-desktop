#!/usr/bin/python
# -*- coding: utf-8 -*-
import hashlib
import os
import sys
import datetime
import tempfile

from PyQt5 import QtCore
from PyQt5 import QtGui
from PyQt5 import QtWebKit
from PyQt5 import QtWebKitWidgets
from PyQt5 import QtNetwork
from PyQt5 import QtWidgets

fn = os.path.basename(os.path.splitext(__file__)[0])
PATH_TEMP = os.path.join(tempfile.gettempdir(), fn)
if not os.path.exists(PATH_TEMP):
    os.makedirs(PATH_TEMP)


def to_uni(obj):
    if isinstance(obj, bytes):
        try:
            return obj.decode('utf-8')
        except UnicodeDecodeError:
            return obj.decode('gbk')
    elif isinstance(obj, (int, long)):
        return unicode(obj)
    elif isinstance(obj, (datetime.date, datetime.datetime)):
        return unicode(obj)
    else:
        return obj

def to_str(obj):
    if isinstance(obj, unicode):
        return obj.encode('utf-8')
    else:
        return obj


class App(QtWidgets.QMainWindow):
    def __init__(self, parent=None):
        super(App, self).__init__(parent)

        x, y, w, h = 500, 200, 1024, 768
        self.setGeometry(x, y, w, h)
        #self.setFixedSize(w, h)

        widget = QtWidgets.QWidget()

        grid = QtWidgets.QGridLayout()

        self.webview = QtWebKitWidgets.QWebView(self)

        grid.addWidget(self.webview, 0, 0, 0, 10)

        self.webview1 = QtWebKitWidgets.QWebView(self)
        grid.addWidget(self.webview1, 1, 0, 10, 10)

        cache =  QtNetwork.QNetworkDiskCache()
        #path = QtGui.QDesktopServices.storageLocation(QtWidgets.QDesktopServices.CacheLocation)
        path = QtCore.QStandardPaths.standardLocations(QtCore.QStandardPaths.CacheLocation)[0]
        cache.setCacheDirectory(path)
        self.am = self.webview.page().networkAccessManager()
        self.am.setCache(cache)

        self.cj = QtNetwork.QNetworkCookieJar()
        self.am.setCookieJar(self.cj)

        self._portal_url = "http://www.google.com/"
        self.webview.load(QtCore.QUrl(self._portal_url))
        self.webview1.load(QtCore.QUrl('https://material.angularjs.org/latest/demo/dialog'))

        self.setup_global_shortcuts()

        #add menus
        self.menuBar().addMenu("&File")

        widget.setLayout(grid)
        self.setCentralWidget(widget)
        self.centralWidget().layout().setContentsMargins(0,0,0,0)

    @property
    def url(self):
        s = str(self.url_lineedit.text()).strip()
        if not s.startswith('http'):
            return 'http://' + s
        return s

    def setup_global_shortcuts(self):
        show_debug_option_kseq = "Ctrl+L"
        key_seq = QtGui.QKeySequence(show_debug_option_kseq)

        act = QtWidgets.QAction(self)
        act.setShortcut(key_seq)

        self.addAction(act)

    def show_and_raise(self):
        self.show()
        self.raise_()


if __name__ == '__main__':
    app = QtWidgets.QApplication(sys.argv)
    demo = App()
    demo.show_and_raise()
    sys.exit(app.exec_())
