import sys
from os.path import dirname, join
 
#from PySide.QtCore import QApplication
from PySide.QtCore import QObject, Slot, Signal
from PySide.QtGui import QApplication
from PySide.QtWebKit import QWebView, QWebSettings
from PySide.QtNetwork import QNetworkRequest
 
 
 
web     = None
myPage  = None
myFrame = None
 
class Hub(QObject):
 
    def __init__(self):
        super(Hub, self).__init__()
 
 
    @Slot(str)
    def connect(self, config):
        print config
        self.on_client_event.emit("Howdy!")
 
    @Slot(str)
    def disconnect(self, config):
        print config
 
    on_client_event = Signal(str)
    on_actor_event = Signal(str)
    on_connect = Signal(str)
    on_disconnect = Signal(str)
 
 
myHub = Hub()
 
class HTMLApplication(object):
 
    def show(self):
        #It is IMPERATIVE that all forward slashes are scrubbed out, otherwise QTWebKit seems to be
        # easily confused
        kickOffHTML = join(dirname(__file__).replace('\\', '/'), "www/index.html").replace('\\', '/')
 
        #This is basically a browser instance
        self.web = QWebView()
 
        #Unlikely to matter but prefer to be waiting for callback then try to catch
        # it in time.
        self.web.loadFinished.connect(self.onLoad)
        self.web.load(kickOffHTML)
 
        self.web.show()
 
    def onLoad(self):
        if getattr(self, "myHub", False) == False:
            self.myHub = Hub()
 
        #This is the body of a web browser tab
        self.myPage = self.web.page()
        self.myPage.settings().setAttribute(QWebSettings.DeveloperExtrasEnabled, True)
        #This is the actual context/frame a webpage is running in.  
        # Other frames could include iframes or such.
        self.myFrame = self.myPage.mainFrame()
        # ATTENTION here's the magic that sets a bridge between Python to HTML
        self.myFrame.addToJavaScriptWindowObject("my_hub", myHub)
 
        #Tell the HTML side, we are open for business
        self.myFrame.evaluateJavaScript("ApplicationIsReady()")
 
 
#Kickoff the QT environment
app = QApplication(sys.argv)
 
myWebApp = HTMLApplication()
myWebApp.show()
 
sys.exit(app.exec_())
