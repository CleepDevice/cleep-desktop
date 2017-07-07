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
from PyQt5.QtCore import QSettings
import requests

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s %(name)s.%(funcName)s +%(lineno)s: %(levelname)-8s [%(process)d] %(message)s')

class Cleep(QMainWindow):

    def __init__(self, app):
        QWidget.__init__(self)

        #init members
        self.app = app
        self.config = {}
        self.logger = logging.getLogger(self.__class__.__name__)
        self.webLeft = None
        self.webRight = None

        #load configuration
        self.load_config()

        #start communication server
        self.comm = CleepCommServer(self.config.value('localhost'), self.config.value('comm_port'), self.command_handler, self.logger)
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

    def command_handler(self, command, params):
        self.logger.debug('Received command %s with params %s' % (command, params))

    def load_config(self):
        #load conf
        self.config = QSettings('cleep', 'cleep-desktop')
        self.logger.debug('Config location: %s' % self.config.fileName())

        #check conf
        #if 'rpc_port' not in self.config.allKeys():
        #    self.logger.debug('Init config value rpc_port')
        #    self.config.setValue('rpc_port', 9610)
        #if 'comm_port' not in self.config.allKeys():
        #    self.config.setValue('comm_port', 9611)

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

    def dialog_proxy(self):
        dialog = QDialog()
        dialog.resize(400, 190)
        dialog.setModal(True)

        grid = QtWidgets.QGridLayout(dialog)
        
        radio_noproxy = QtWidgets.QRadioButton(Dialog)
        radio_noproxy.setText('Direct connection')
        grid.addWidget(radio_noproxy, 0, 0, 1, 2)
        
        radio_manualproxy = QtWidgets.QRadioButton(Dialog)
        radio_manulaproxy.setText('Manual proxy configuration')
        grid.addWidget(radio_manualproxy, 1, 0, 1, 2)

        label_proxyip = QtWidgets.QLabel(dialog)
        label_proxyip.setText('Proxy ip')
        grid.addWidget(label_proxyip, 2, 0, 1, 1)

        edit_proxyip = QtWidgets.QLineEdit(dialog)
        grid.addWidget(edit_proxyip, 2, 1, 1, 1)

        label_proxyport = QtWidgets.QLabel(dialog)
        label_proxyport.setText('Proxy port')
        grid.addWidget(label_proxyport, 3, 0, 1, 1)

        edit_proxyport = QtWidgets.QLineEdit(dialog)
        grid.addWidget(edit_proxyport, 3, 1, 1, 1)

        button_box = QtWidgets.QDialogButtonBox(dialog)
        button_box.setOrientation(QtCore.Qt.Horizontal)
        button_box.setStandardButtons(QtWidgets.QDialogButtonBox.Cancel|QtWidgets.QDialogButtonBox.Ok)
        grid.addWidget(button_box, 4, 0, 1, 2)

        dialog.exec()

    def configure_proxy(self):
        proxy = QNetworkProxy()
        proxy.setType(QNetworkProxy.HttpProxy)
        proxy.setHostName('localhost')
        proxy.setPort(8080)
        QNetworkProxy.setApplicationProxy(proxy)

    def show_preferences(self):
        #cmd = CleepCommand()
        #cmd.command = 'open'
        #cmd.params = 'preferences'
        #self.comm.send(cmd)
        self.webRight.load(QUrl('http://127.0.0.1:%d/preferences.html' % self.config.value('rpc_port')))

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

    def init_ui(self):
        #configure main window
        self.setWindowTitle('Cleep')

        #add menus
        menubar = self.menuBar()
        fileMenu = menubar.addMenu('&File')
        fileMenu.addAction(self.prefAction)
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
        self.webLeft = QWebEngineView()
        sizePolicy = QtWidgets.QSizePolicy(QtWidgets.QSizePolicy.Fixed, QtWidgets.QSizePolicy.Expanding)
        self.webLeft.setSizePolicy(sizePolicy)
        self.webLeft.setContextMenuPolicy(Qt.NoContextMenu)
        self.webLeft.setMaximumSize(QtCore.QSize(250, 16777215))
        box.addWidget(self.webLeft)
        self.webLeft.load(QUrl('http://127.0.0.1:%d/index.html' % self.config.value('rpc_port')))
        
        #set right web panel
        self.webRight = QWebEngineView()
        self.webRight.setContextMenuPolicy(Qt.NoContextMenu)
        box.addWidget(self.webRight)
        #self.webRight.load(QUrl("http://192.168.1.81"))
        self.webRight.load(QUrl('http://127.0.0.1:%d/welcome.html' % self.config.value('rpc_port')))

        #show window
        self.showMaximized()

 
app = QApplication(sys.argv)
cleep = Cleep(app) 
sys.exit(app.exec_())

