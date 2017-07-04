#!/usr/bin/env python3
 
import sys
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

class Cleep(QWidget):
    def __init__(self):
        QWidget.__init__(self)

        if platform.system()=='Windows':
            #https://bugreports.qt.io/browse/QTBUG-44763
            QNetworkProxyFactory.setUseSystemConfiguration(False)

        self.setWindowTitle('Cleep')
        self.initUi()

    def initUi(self):
        box = QHBoxLayout()
        box.setContentsMargins(0, 0, 0, 0)
        box.setSpacing(0)
        self.setLayout(box)
    
        webLeft = QWebEngineView()
        sizePolicy = QtWidgets.QSizePolicy(QtWidgets.QSizePolicy.Fixed, QtWidgets.QSizePolicy.Expanding)
        webLeft.setSizePolicy(sizePolicy)
        webLeft.setMaximumSize(QtCore.QSize(250, 16777215))
        box.addWidget(webLeft)
        
        webRight = QWebEngineView()
        box.addWidget(webRight)

        self.showMaximized()

        webLeft.load(QUrl("https://www.google.com"))
        webRight.load(QUrl("https://www.google.com"))

 
app = QApplication(sys.argv)
cleep = Cleep() 
sys.exit(app.exec_())


#web = QWebEngineView()
#web.load(QUrl("https://material.angularjs.org/latest/demo/dialog"))
#web.show()
 
