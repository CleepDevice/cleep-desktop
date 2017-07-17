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
        self.comm = CleepCommClient(self.config.value('localhost', type=str), self.config.value('comm_port', type=int), self.signal, self.logger)
        if not self.comm.connect():
            raise Exception('Unable to connect Comm. Stop application')
        self.comm.start()

        #self.comm = CleepCommClientQt(self.config.value('localhost', type=str), self.config.value('comm_port', type=int), self.signal, self.logger)
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

    #-----------
    # NAVIGATION
    #-----------
    
    def open_page(self, page):
        """
        Open page in right panel

        Args:
            page (string): page to open
        """
        self.logger.debug('Opening %s' % page)
        self.web_right.load(QUrl('http://127.0.0.1:%d/%s' % (self.config.value('rpc_port', type=int), page)))
        self.previous_page = self.current_page
        self.current_page = page

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

    def show_help(self):
        self.open_page('installation.html')

    def show_preferences(self):
        self.open_page('preferences.html')

    def show_homepage(self):
        self.open_page('homepage.html')

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
        proxy = QNetworkProxy()
        proxy.setType(QNetworkProxy.HttpProxy)
        proxy.setHostName('localhost')
        proxy.setPort(8080)
        QNetworkProxy.setApplicationProxy(proxy)


    def init_actions(self):
        #close action
        self.app.aboutToQuit.connect(self.handle_exit)

        #exit action
        self.exitAction = QAction(QIcon('exit24.png'), 'Exit', self)
        #self.exitAction.setShortcut('Ctrl+Q')
        self.exitAction.setStatusTip('Exit application')
        self.exitAction.triggered.connect(self.handle_exit)

        #help action
        self.helpAction = QAction(QIcon(''), 'Help', self)
        #self.helpAction.setShortcut('Ctrl+H')
        self.helpAction.setStatusTip('Help')
        self.helpAction.triggered.connect(self.show_help)

        #open preferences
        self.prefAction = QAction(QIcon(''), 'Preferences', self)
        self.prefAction.setStatusTip('Open preferences')
        self.prefAction.triggered.connect(self.show_preferences)

        #open homepage
        self.homepageAction = QAction(QIcon(''), 'Homepage', self)
        self.homepageAction.setStatusTip('Open homepage')
        self.homepageAction.triggered.connect(self.show_homepage)

        #back action
        self.backAction = QAction(QIcon(''), 'Back', self)
        self.backAction.setStatusTip('Back')
        self.backAction.triggered.connect(self.back)

        #installation
        self.installAction = QAction(QIcon(''), 'Installation', self)
        self.installAction.triggered.connect(lambda: self.open_page('installation.html'))

        #about
        self.aboutAction = QAction(QIcon(''), 'About', self)
        self.aboutAction.triggered.connect(lambda: self.open_page('about.html'))


    def init_ui(self):
        #configure main window
        self.setWindowTitle('Cleep')

        #add menus
        menubar = self.menuBar()
        fileMenu = menubar.addMenu('&File')
        fileMenu.addAction(self.backAction)
        fileMenu.addAction(self.homepageAction)
        fileMenu.addAction(self.prefAction)
        fileMenu.addSeparator()
        fileMenu.addAction(self.exitAction)
        helpMenu = menubar.addMenu('&Help')
        helpMenu.addAction(self.installAction)
        helpMenu.addSeparator()
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
        self.web_left.setMaximumSize(QtCore.QSize(250, 16777215))
        box.addWidget(self.web_left)
        self.web_left.load(QUrl('http://127.0.0.1:%d/index.html' % self.config.value('rpc_port', type=int)))
        #disable cache
        self.web_left.page().profile().setHttpCacheType(QWebEngineProfile.NoCache)
        
        #set right web panel
        self.web_right = QWebEngineView()
        #self.web_right.setContextMenuPolicy(Qt.NoContextMenu)
        box.addWidget(self.web_right)
        self.open_page('homepage.html')
        #disable cache
        self.web_right.page().profile().setHttpCacheType(QWebEngineProfile.NoCache)

        #show window
        self.showMaximized()

app = None
try: 
    app = QApplication(sys.argv)
    cleep = Cleep(app) 
    sys.exit(app.exec_())

except SystemExit:
    logging.info('UI closed')

except:
    logging.exception('Fatal exception')

