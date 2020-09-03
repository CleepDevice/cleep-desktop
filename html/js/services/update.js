const {
    CHECK_FOR_UPDATE,
    CHECK_FOR_UPDATE_SUCCESS,
    CHECK_FOR_UPDATE_FAILURE,
    DOWNLOAD_UPDATE,
    DOWNLOAD_PERCENT,
    DOWNLOAD_UPDATE_SUCCESS,
    DOWNLOAD_UPDATE_FAILURE,
    QUIT_AND_INSTALL,
} = require(path.resolve('./updater'));

/**
 * Update service handles CleepDesktop updates using appUdater
 * This service handles properly update taskpanel
 * It can returns Cleepdesktop update status and last error
 */
var updateService = function($rootScope, logger, $timeout, tasksPanelService, cleepUi, $q, cleepService, cleepdesktopInfos) {
    var self = this;

    // status from updates.py
    self.STATUS_IDLE = 0;
    self.STATUS_DOWNLOADING = 1;
    self.STATUS_INSTALLING = 2;
    self.STATUS_DONE = 3;
    self.STATUS_ERROR = 4;

    // status from libs/download.py
    self.DOWNLOAD_IDLE = 0;
    self.DOWNLOAD_DOWNLOADING = 1;
    self.DOWNLOAD_DOWNLOADING_NOSIZE = 2;
    self.DOWNLOAD_ERROR = 3;
    self.DOWNLOAD_ERROR_INVALIDSIZE = 4;
    self.DOWNLOAD_ERROR_BADCHECKSUM = 5;
    self.DOWNLOAD_ERROR_NETWORK = 6;
    self.DOWNLOAD_DONE = 7;

    // members
    self.taskUpdatePanel = null;
    self.taskUpdatePanelClosedByUser = false;
    self.updatingCleepdesktop = false;
    self.updatingEtcher = false;
    self.cleepdesktopUpdatesDisabled = false;
    self.cleepdesktopUpdateAvailable = false;
    self.cleepdesktopStatus = {
        // version: appUpdater.currentVersion,
        version: '0.0.0',
        status: self.STATUS_IDLE,
        downloadpercent: null,
        lasterror: '',
        restartrequired: false
    };
    self.etcherStatus = {
        version: null,
        status: self.STATUS_IDLE,
        downloadpercent: null,
        downloadstatus: null
    };
    self.changelog = null;
    self.currentVersion = '0.0.0';

    // go to updates page
    self.__goToUpdates = function() {
        cleepUi.openPage('updates');
    };

    // on close update task panel
    self.__onCloseUpdateTaskPanel = function() {
        //reset variable
        self.taskUpdatePanel = null;
        self.taskUpdatePanelClosedByUser = true;
    };

    //Handle opening/closing of update task panel according to current cleepdesktop and etcher update status
    self.__handleUpdateTaskPanel = function() {
        if( (self.updatingCleepdesktop || self.updatingEtcher) && self.taskUpdatePanelClosedByUser ) {
            //update task panel closed by user, do not open again

        } else if( !self.updatingCleepdesktop && !self.updatingEtcher && self.taskUpdatePanelClosedByUser ) {
            //update task panel closed by user but updates terminated, reset flag
            self.taskUpdatePanelClosedByUser = false;

        } else if( (self.updatingCleepdesktop || self.updatingEtcher) && !self.taskUpdatePanel ) {
            //no update task panel opened yet while update is in progress, open it
            self.taskUpdatePanel = tasksPanelService.addItem(
                'Updating application...', 
                {
                    onAction: self.__goToUpdates,
                    tooltip: 'Go to updates',
                    icon: 'update'
                },
                {
                    onClose: self.__onCloseUpdateTaskPanel,
                    disabled: false
                },
                true
            );

        } else if( !self.updatingCleepdesktop && !self.updatingEtcher && self.taskUpdatePanel ) {
            //no update is running and task panel is opened, close it
            tasksPanelService.removeItem(self.taskUpdatePanel);
            self.taskUpdatePanel = null;
            self.taskUpdatePanelClosedByUser = false;
        }
    };

    //Init update service adding appUpdater and cleepdesktopcore events handlers
    self.init = function() {
        /*if( process.platform==='darwin' )
        {
            //disable auto updates on macos due to missing certification key that is needed :(
            self.cleepdesktopUpdatesDisabled = true;
            appUpdater.autoDownload = false;
            logger.info('Updates are disabled on MacOs because we need to pay 99$ to get Apple Developper ID. ' +
            'If Cleep project earns money one day, we will reconsider that.');
        }*/

        // handle etcher update here to add update task panel
        $rootScope.$on('updates', function(_event, data) {
            if( !data ) {
                return;
            }

            //update etcher status
            self.etcherStatus.version = data.etcherstatus.version;
            self.etcherStatus.status = data.etcherstatus.status;
            self.etcherStatus.downloadpercent = data.etcherstatus.downloadpercent;
            self.etcherStatus.downloadstatus = data.etcherstatus.downloadstatus;

            //update internal flags
            self.lastUpdateCheck = data.lastUpdateCheck;
            if( data.etcherstatus.status>=3 ) {
                //etcher update is terminated
                self.updatingEtcher = false;

            } else if( !self.taskUpdatePanel && data.etcherstatus.status>0 ) {
                //etcher update has started
                self.updatingEtcher = true;
            }

            //update task panel
            self.__handleUpdateTaskPanel();
        });

        ipcRenderer.on(CHECK_FOR_UPDATE_SUCCESS, (event, updateInfo) => {
            const version = updateInfo && updateInfo.version;
          
            if (version && version !== currentAppVersion) {
                // auto-download disabled on macos due to licence key needed to perform installation.
                // If Cleep project earns money one day, we will reconsider that.
                if( process.platform !== 'darwin' ) {
                    // set status
                    self.cleepdesktopStatus.status = self.STATUS_DOWNLOADING;
                    self.cleepdesktopStatus.downloadpercent = null;

                    // trigger update
                    ipcRenderer.send(DOWNLOAD_UPDATE);

                    // update task panel
                    self.__handleUpdateTaskPanel();
                }
            } else {
                // no updates found
                self.cleepdesktopStatus.status = self.STATUS_IDLE;
                self.cleepdesktopStatus.downloadpercent = null;
            }
        });

        //get initial status
        cleepService.sendCommand('get_status', 'updates')
            .then(function(resp) {
                self.etcherStatus.version = resp.data.etcherstatus.version;
                self.etcherStatus.status = resp.data.etcherstatus.status;
                self.etcherStatus.downloadpercent = resp.data.etcherstatus.downloadpercent;
                self.etcherStatus.downloadstatus = resp.data.etcherstatus.downloadstatus;
                self.lastCheck = resp.data.lastcheck;
            });
    };

    // check cleepdesktop update
    self.checkCleepDesktopUpdate = () => {
        logger.info('Check CleepDesktop update');
        ipcRenderer.send(CHECK_FOR_UPDATE_PENDING);
    };

    // check etcher update
    self.checkEtcherUpdate = () => {
        cleepService.sendCommand('check_updates', 'updates')
            .then((resp) => {
                // TODO
            })
    };
};
    
var Cleep = angular.module('Cleep');
Cleep.service('updateService', ['$rootScope', 'logger', '$timeout', 'tasksPanelService', 'cleepUi', 
            '$q', 'cleepService', 'cleepdesktopInfos', updateService]);
