#!/usr/bin/env python3
 
import sys
from OpenGL import GL
from PyQt5 import QtCore, QtGui, QtWidgets
from PyQt5.QtCore import *
from PyQt5.QtGui import *
from PyQt5.QtWidgets import *
#from PyQt5.QtWebKit import *
#from PyQt5.QtWebKitWidgets import *
from PyQt5.QtWebEngineWidgets import *
from PyQt5.QtWidgets import QApplication, QWidget, QMainWindow
from PyQt5.QtWidgets import QGridLayout

class Cleep(QWidget):
    def __init__(self):
        QWidget.__init__(self)
        self.initUi()

    def initUi(self):
        self.setWindowTitle('Cleep')

        grid = QGridLayout()
        self.setLayout(grid)

        webLeft = QWebEngineView()
        webLeft.load(QUrl("https://www.google.com"))
        grid.addWidget(webLeft, 1, 0, 1, 1)

        webRight = QWebEngineView()
        webRight.load(QUrl("https://www.google.com"))
        grid.addWidget(webRight, 1, 1, -1, -1)

        self.show()

 
app = QApplication(sys.argv)
cleep = Cleep() 
sys.exit(app.exec_())


#web = QWebEngineView()
#web.load(QUrl("https://material.angularjs.org/latest/demo/dialog"))
#web.show()
 
