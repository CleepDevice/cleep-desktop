#!/usr/bin/env python3
 
import os
import signal 
import sys
import logging
import json 
from OpenGL import GL
from PyQt5 import QtCore, QtGui, QtWidgets
from PyQt5.QtCore import *
from PyQt5.QtGui import *
from PyQt5.QtWidgets import *
from PyQt5.QtWebEngineWidgets import *
from PyQt5.QtWidgets import QApplication, QWidget, QMainWindow
from PyQt5.QtWidgets import QGridLayout, QHBoxLayout
from PyQt5.QtNetwork import QNetworkProxyFactory, QNetworkAccessManager, QNetworkProxy
import platform
from PyQt5.QtWidgets import QSizePolicy
from comm import CleepCommand, CleepCommServer
import requests

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s %(name)s.%(funcName)s +%(lineno)s: %(levelname)-8s [%(process)d] %(message)s')

class Cleep(QMainWindow):

    def __init__(self, app):
        QWidget.__init__(self)

        #init members
        self.app = app
        self.logger = logging.getLogger(self.__class__.__name__)
        self.comm = CleepCommServer(self.logger)
        self.comm.connect()
        self.comm.start()

        if platform.system()=='Windows':
            #disable system proxy for windows https://bugreports.qt.io/browse/QTBUG-44763
            QNetworkProxyFactory.setUseSystemConfiguration(False)

        #self.networkAccessManager = QNetworkAccessManager()
        #self.networkAccessManager.authenticationRequired.connect(self.handle_auth)
        #self.networkAccessManager.sslErrors(self.handle_ssl_errors)

        self.configure_proxy()
        self.init_actions()
        self.init_ui()

    def load_configuration(self):
        pass

    def send_command(self, command, params=None):
        url = 'http://localhost:9666/%s' % command
        resp = requests.post(url, params).json()
        #self.logger.debug('response encoding %s' % raw.encoding)
        self.logger.debug('response: %s' % resp)
        #resp = json.loads(raw)
        #self.logger.debug('response dict: %s' % resp)

        #TODO handle errors

        return resp['data']

    def show_help(self):
        self.logger.debug('--> showHelp')
        #self.send_command('pid')

    def handle_exit(self):
        #stop comm
        if self.comm:
            self.comm.disconnect()

        #kill rpcserver instance first
        #resp = self.send_command('pid')
        #self.logger.debug('Kill rpcserver pid=%d' % resp['pid'])
        #os.kill(resp['pid'], signal.SIGTERM)

        #finally close application
        self.logger.debug('Close application')
        self.close()

    def handle_ssl_errors(self, reply, errors):
        self.logger.debug('handle sslerrors')
        self.logger.debug('\n'.join([str(error.errorString()) for error in errors]))

    def handle_auth(self):
        self.logger.debug('handle auth')
        dialog = QDialog()
        dialog.resize(400, 128)
        dialog.setModal(True)

        grid = QtWidgets.QGridLayout(dialog)

        loginLabel = QtWidgets.QLabel(dialog)
        loginLabel.setText('Login')
        grid.addWidget(loginLabel, 0, 0, 1, 1)

        loginEdit = QtWidgets.QLineEdit(dialog)
        grid.addWidget(loginEdit, 0, 1, 1, 1)

        passwordLabel = QtWidgets.QLabel(dialog)
        passwordLabel.setText('Password')
        grid.addWidget(passwordLabel, 2, 0, 1, 1)

        passwordEdit = QtWidgets.QLineEdit(dialog)
        passwordEdit.setEchoMode(QtWidgets.QLineEdit.Password)
        grid.addWidget(passwordEdit, 2, 1, 1, 1)

        buttonBox = QtWidgets.QDialogButtonBox(dialog)
        buttonBox.setOrientation(QtCore.Qt.Horizontal)
        buttonBox.setStandardButtons(QtWidgets.QDialogButtonBox.Cancel|QtWidgets.QDialogButtonBox.Ok)
        grid.addWidget(buttonBox, 3, 0, 1, 2)

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

    def init_ui(self):
        #configure main window
        self.setWindowTitle('Cleep')

        #add menus
        menubar = self.menuBar()
        fileMenu = menubar.addMenu('&File')
        fileMenu.addAction(self.exitAction)
        helpMenu = menubar.addMenu('&Help')
        helpMenu.addAction(self.helpAction)

        #set main container (central widget)
        container = QWidget()
        self.setCentralWidget(container)

        #create container layout (hbox here)
        box = QHBoxLayout()
        box.setContentsMargins(0, 0, 0, 0)
        box.setSpacing(0)
        container.setLayout(box)

        #set left web panel
        webLeft = QWebEngineView()
        sizePolicy = QtWidgets.QSizePolicy(QtWidgets.QSizePolicy.Fixed, QtWidgets.QSizePolicy.Expanding)
        webLeft.setSizePolicy(sizePolicy)
        webLeft.setContextMenuPolicy(Qt.NoContextMenu)
        webLeft.setMaximumSize(QtCore.QSize(250, 16777215))
        box.addWidget(webLeft)
        webLeft.load(QUrl("http://localhost:9666/index.html"))
        
        #set right web panel
        webRight = QWebEngineView()
        webRight.setContextMenuPolicy(Qt.NoContextMenu)
        box.addWidget(webRight)
        webRight.load(QUrl("http://192.168.1.81"))

        #show window
        self.showMaximized()

 
app = QApplication(sys.argv)
cleep = Cleep(app) 
sys.exit(app.exec_())

