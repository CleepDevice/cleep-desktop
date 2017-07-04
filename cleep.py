#!/usr/bin/env python3
 
import sys
import logging
from OpenGL import GL
from PyQt5 import QtCore, QtGui, QtWidgets
from PyQt5.QtCore import *
from PyQt5.QtGui import *
from PyQt5.QtWidgets import *
from PyQt5.QtWebEngineWidgets import *
from PyQt5.QtWidgets import QApplication, QWidget, QMainWindow
from PyQt5.QtWidgets import QGridLayout, QHBoxLayout
from PyQt5.QtNetwork import QNetworkProxyFactory
import platform
from PyQt5.QtWidgets import QSizePolicy

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s %(name)s.%(funcName)s +%(lineno)s: %(levelname)-8s [%(process)d] %(message)s')

class Cleep(QMainWindow):
    def __init__(self):
        QWidget.__init__(self)

        if platform.system()=='Windows':
            #disable system proxy for windows https://bugreports.qt.io/browse/QTBUG-44763
            QNetworkProxyFactory.setUseSystemConfiguration(False)

        self.initActions()
        self.initUi()

    def showHelp(self):
        logging.debug('--> showHelp')

    def initActions(self):
        #exit action
        self.exitAction = QAction(QIcon('exit24.png'), 'Exit', self)
        #self.exitAction.setShortcut('Ctrl+Q')
        self.exitAction.setStatusTip('Exit application')
        self.exitAction.triggered.connect(self.close)

        #help action
        self.helpAction = QAction(QIcon(''), 'Help', self)
        #self.helpAction.setShortcut('Ctrl+H')
        self.helpAction.setStatusTip('Help')
        self.helpAction.triggered.connect(self.showHelp)

    def initUi(self):
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
        webLeft.setMaximumSize(QtCore.QSize(250, 16777215))
        box.addWidget(webLeft)
        webLeft.load(QUrl("https://www.google.com"))
        
        #set right web panel
        webRight = QWebEngineView()
        box.addWidget(webRight)
        webRight.load(QUrl("https://www.google.com"))

        #show window
        self.showMaximized()

 
app = QApplication(sys.argv)
cleep = Cleep() 
sys.exit(app.exec_())


#web = QWebEngineView()
#web.load(QUrl("https://material.angularjs.org/latest/demo/dialog"))
#web.show()
 
