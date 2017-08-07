#!/usr/bin/env python3
 
import os
import signal 
import sys
import logging
import json 
from OpenGL import GL
from PyQt5 import QtCore, QtGui, QtWidgets
from PyQt5.QtCore import pyqtSignal, pyqtSlot, QThread, Qt, QUrl
from PyQt5.QtGui import *
from PyQt5.QtWidgets import *
from PyQt5.QtWebEngineWidgets import *
from PyQt5.QtWidgets import QApplication, QWidget, QMainWindow
from PyQt5.QtWidgets import QGridLayout, QHBoxLayout
from PyQt5.QtNetwork import QNetworkProxyFactory, QNetworkAccessManager, QNetworkProxy
import platform
from PyQt5.QtWidgets import QSizePolicy
from comm import CleepCommand, CleepCommClientQt, CleepCommClient
from PyQt5.QtCore import QSettings
import requests
import webbrowser

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s %(name)s.%(funcName)s +%(lineno)s: %(levelname)-8s [%(process)d] %(message)s')

class Cleep(QMainWindow):

    signal = pyqtSignal(str, dict)

    def __init__(self, app):
        QWidget.__init__(self)

        #init members
        self.app = app
        self.config = {}
        self.logger = logging.getLogger(self.__class__.__name__)
        self.web_left = None
        self.web_right = None
        self.previous_page = None
        self.current_page = None

        #load configuration
        self.load_config()

        #start communication
        self.start_comm_thread()

        if platform.system()=='Windows':
            #disable system proxy on windows env https://bugreports.qt.io/browse/QTBUG-44763
            QNetworkProxyFactory.setUseSystemConfiguration(False)

        #handle ssl warnings
        #self.networkAccessManager = QNetworkAccessManager()
        #self.networkAccessManager.authenticationRequired.connect(self.handle_auth)
        #self.networkAccessManager.sslErrors(self.handle_ssl)

        #configure proxy or ssh tunnel
        self.configure_proxy()

        #prepare and start ui
        self.init_actions()
        self.init_ui()

    def load_config(self):
        """
        Load configuration and fill config member
        """
        self.config = QSettings('cleep', 'cleep-desktop')

    def start_comm_thread(self):
        """
        Start communication thread
        RpcServer receives commands from webpage and send them to Ui through socket
        """
        #connect signal to ui command_handler
        self.signal.connect(self.command_handler)

        #and start CommClient
        self.comm = CleepCommClient(self.config.value('localhost', type=str), self.config.value('commport', type=int), self.signal, self.logger)
        if not self.comm.connect():
            raise Exception('Unable to connect Comm. Stop application')
        self.comm.start()

        #self.comm = CleepCommClientQt(self.config.value('localhost', type=str), self.config.value('commport', type=int), self.signal, self.logger)
        #if not self.comm.connect():
        #    self.logger.critical('Unable to connect to COMM socket. Stop application.')
        #    raise Exception('Fatal exception: unable to connect to COMM')
        #else:
        #    #create thread
        #    self.thread = QThread()
        #    self.thread.start()
        
        #    #connect comm instance to thread
        #    self.comm.moveToThread(self.thread)
        #    self.comm.start.connect(self.comm.run)
        #    #start "thread"
        #    self.comm.start.emit()

        #    #self.comm.start()
            
    def scan(self):
        self.logger.debug('Launch scan')

    #-----------
    # NAVIGATION
    #-----------
    
    def open_page(self, page, right_panel=True):
        """
        Open page in right panel

        Args:
            page (string): page to open
        """
        if right_panel:
            self.logger.debug('Opening %s on right panel' % page)
            self.web_right.load(QUrl('http://127.0.0.1:%d/%s?port=%s' % (self.config.value('rpcport', type=int), page, self.config.value('commport', type=int))))
            self.previous_page = self.current_page
            self.current_page = page

        else:
            self.logger.debug('Opening %s on left panel' % page)
            self.web_left.load(QUrl('http://127.0.0.1:%d/%s?port=%s' % (self.config.value('rpcport', type=int), page, self.config.value('commport', type=int))))

    def back(self):
        """
        Return to last opened page if possible
        """
        self.logger.debug('back function back to %s' % self.previous_page)
        if self.previous_page is not None:
            self.open_page(self.previous_page)
        else:
            self.logger.debug('Unable to go back because no previous page available')

    @pyqtSlot(str, dict)
    def command_handler(self, command, params):
        """
        Command handler is called by communication thread after webpage commands

        Args:
            command (string): received command
            params (dict): command parameters
        """
        self.logger.debug('Received command %s with params %s' % (command, params))
        if command=='back':
            self.back()
        elif command=='scan':
            pass
        elif command=='saveConfig':
            pass

    #def send_command(self, command, params=None):
    #    url = 'http://localhost:9666/%s' % command
    #    resp = requests.post(url, params).json()
    #    #self.logger.debug('response encoding %s' % raw.encoding)
    #    self.logger.debug('response: %s' % resp)
    #    #resp = json.loads(raw)
    #    #self.logger.debug('response dict: %s' % resp)
    #    return resp['data']


    #-----------
    # UI
    #-----------

    def handle_exit(self):
        #stop comm
        if self.comm:
            self.comm.disconnect()

        #finally close application
        self.logger.debug('Close application')
        self.close()

    def handle_ssl(self, reply, errors):
        """
        Handle ssl warnings and errors accepting requests
        """
        self.logger.debug('handle sslerrors')
        self.logger.debug('\n'.join([str(error.errorString()) for error in errors]))

    def dialog_auth(self):
        self.logger.debug('handle auth')
        dialog = QDialog()
        dialog.resize(400, 128)
        dialog.setModal(True)

        grid = QtWidgets.QGridLayout(dialog)

        label_login = QtWidgets.QLabel(dialog)
        label_login.setText('Login')
        grid.addWidget(label_login, 0, 0, 1, 1)

        edit_login = QtWidgets.QLineEdit(dialog)
        grid.addWidget(edit_login, 0, 1, 1, 1)

        label_password = QtWidgets.QLabel(dialog)
        label_password.setText('Password')
        grid.addWidget(label_password, 2, 0, 1, 1)

        edit_password = QtWidgets.QLineEdit(dialog)
        edit_password.setEchoMode(QtWidgets.QLineEdit.Password)
        grid.addWidget(edit_password, 2, 1, 1, 1)

        button_box = QtWidgets.QDialogButtonBox(dialog)
        button_box.setOrientation(QtCore.Qt.Horizontal)
        button_box.setStandardButtons(QtWidgets.QDialogButtonBox.Cancel|QtWidgets.QDialogButtonBox.Ok)
        grid.addWidget(button_box, 3, 0, 1, 2)

        dialog.exec()

    def configure_proxy(self):
        proxy_mode = self.config.value('proxymode', type=str)
        if proxy_mode=='manualproxy':
            proxy_ip = self.config.value('proxyip', type=str)
            proxy_port = self.config.value('proxyport', type=int)
            self.logger.debug('Proxy enabled at %s:%d' % (proxy_ip, proxy_port))
            
            proxy = QNetworkProxy()
            proxy.setType(QNetworkProxy.HttpProxy)
            proxy.setHostName(proxy_ip)
            proxy.setPort(proxy_port)
            QNetworkProxy.setApplicationProxy(proxy)

        else:
            self.logger.debug('Proxy disabled')

    def init_actions(self):
        #close action
        self.app.aboutToQuit.connect(self.handle_exit)

        #exit action
        self.exitAction = QAction(QIcon('exit24.png'), 'Exit', self)
        #self.exitAction.setShortcut('Ctrl+Q')
        #self.exitAction.setStatusTip('Exit application')
        self.exitAction.triggered.connect(self.handle_exit)

        #scan action
        self.scanAction = QAction(QIcon(''), 'Search new devices', self)
        self.scanAction.triggered.connect(self.scan)

        #help action
        self.helpAction = QAction(QIcon(''), 'Help', self)
        self.helpAction.triggered.connect(lambda: self.open_page('help'))

        #open preferences
        self.prefAction = QAction(QIcon(''), 'Preferences', self)
        self.prefAction.triggered.connect(lambda: self.open_page('preferences.html'))

        #open homepage
        self.homepageAction = QAction(QIcon(''), 'Homepage', self)
        self.homepageAction.triggered.connect(lambda: self.open_page('homepage.html'))

        #back action
        self.backAction = QAction(QIcon(''), 'Back', self)
        self.backAction.triggered.connect(self.back)

        #installation on sdcard
        self.sdcardAction = QAction(QIcon(''), 'Easy install', self)
        self.sdcardAction.triggered.connect(lambda: self.open_page('installEasy.html'))

        #installation on raspbian
        self.raspbianAction = QAction(QIcon(''), 'Manual install', self)
        self.raspbianAction.triggered.connect(lambda: self.open_page('installManually.html'))

        #support
        #self.supportAction = QAction(QIcon(''), 'Get support', self)
        #self.supportAction.triggeredAction.connect(lambda: self.open_page('support.html'))

        #TODO social
        #self.socialAction = QAction(QIcon(''), 'Follow Cleep', self)
        #self.socialAction.triggered.connect(lambda: self.open_page('social.html'))

        #about
        self.aboutAction = QAction(QIcon(''), 'About Cleep', self)
        self.aboutAction.triggered.connect(lambda: self.open_page('about.html'))


    def init_ui(self):
        #configure main window
        self.setWindowTitle('Cleep-desktop')

        #add menus
        menubar = self.menuBar()
        fileMenu = menubar.addMenu('&File')
        fileMenu.addAction(self.backAction)
        fileMenu.addAction(self.homepageAction)
        fileMenu.addAction(self.scanAction)
        fileMenu.addSeparator()
        fileMenu.addAction(self.prefAction)
        fileMenu.addSeparator()
        fileMenu.addAction(self.exitAction)

        installMenu = menubar.addMenu('&Cleep install')
        installMenu.addAction(self.sdcardAction)
        installMenu.addAction(self.raspbianAction)

        #helpMenu = menubar.addMenu('&Help')
        #helpMenu.addAction(self.helpAction)
        #helpMenu.addSeparator()
        #helpMenu.addAction(self.socialAction)
        #helpMenu.addSeparator()
        helpMenu.addAction(self.aboutAction)

        #set main container (central widget)
        container = QWidget()
        self.setCentralWidget(container)

        #create container layout (hbox here)
        box = QHBoxLayout()
        box.setContentsMargins(0, 0, 0, 0)
        box.setSpacing(0)
        container.setLayout(box)

        #set left web panel
        self.web_left = QWebEngineView()
        sizePolicy = QtWidgets.QSizePolicy(QtWidgets.QSizePolicy.Fixed, QtWidgets.QSizePolicy.Expanding)
        self.web_left.setSizePolicy(sizePolicy)
        self.web_left.setContextMenuPolicy(Qt.NoContextMenu)
        self.web_left.setMaximumSize(QtCore.QSize(350, 16777215))
        box.addWidget(self.web_left)
        self.open_page('devices.html', False)
        #self.web_left.load(QUrl('http://127.0.0.1:%d/devices.html' % self.config.value('rpcport', type=int)))
        #disable cache
        self.web_left.page().profile().setHttpCacheType(QWebEngineProfile.NoCache)
        
        #set right web panel
        self.web_right = QWebEngineView()
        #self.web_right.setContextMenuPolicy(Qt.NoContextMenu)
        box.addWidget(self.web_right)
        page = CleepWebPage(QWebEngineProfile.NoCache, self.logger, self.web_right)
        self.web_right.setPage(page)
        self.open_page('homepage.html')
        #disable cache
        #self.web_right.page().profile().setHttpCacheType(QWebEngineProfile.NoCache)
        #handle href
        #self.web_right.page().acceptNavigationRequest = self.coucou

        #show window
        self.showMaximized()

class CleepWebPage(QWebEnginePage):
    def __init__(self, profile, logger, parent=None):
        QWebEnginePage.__init__(self, parent)
        self.logger = logger

    def acceptNavigationRequest(self, url, navigationType, isMainFrame):
        if navigationType==QWebEnginePage.NavigationTypeLinkClicked:
            self.logger.debug('url=%s navType=%s mainFrm=%s' % (url, navigationType, isMainFrame))
            host = url.host()
            if host in ['localhost', '127.0.0.1']:
                #open specified local page
                return True

            else:
                #open external browser to open external link
                webbrowser.open(url.url())
                return False

        return True

app = None
try: 
    app = QApplication(sys.argv)
    cleep = Cleep(app) 
    sys.exit(app.exec_())

except SystemExit:
    logging.info('UI closed')

except:
    logging.exception('Fatal exception')

