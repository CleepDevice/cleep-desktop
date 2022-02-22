/**
 * Update service handles CleepDesktop updates using appUdater
 * This service handles properly update taskpanel
 * It can returns Cleepdesktop update status and last error
 */
angular
.module('Cleep')
.service('updateService', ['$rootScope', 'loggerService', '$timeout', 'tasksPanelService', 'cleepUi', '$q',
                           'cleepService', 'electronService',
function($rootScope, logger, $timeout, tasksPanelService, cleepUi, $q, cleepService, electron) {
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
        version: electron.sendReturn('updater-get-current-version'),
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

    self.init = function() {
        self.__addIpcs();
        
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

            // update etcher status
            self.etcherStatus.version = data.etcherstatus.version;
            self.etcherStatus.status = data.etcherstatus.status;
            self.etcherStatus.downloadpercent = data.etcherstatus.downloadpercent;
            self.etcherStatus.downloadstatus = data.etcherstatus.downloadstatus;

            // update internal flags
            self.lastUpdateCheck = data.lastUpdateCheck;
            if( data.etcherstatus.status>=3 ) {
                // etcher update is terminated
                self.updatingEtcher = false;
            } else if( !self.taskUpdatePanel && data.etcherstatus.status>0 ) {
                // etcher update has started
                self.updatingEtcher = true;
            }

            self.__handleUpdateTaskPanel();
        });

        cleepService.sendCommand('get_status', 'updates')
            .then(function(resp) {
                self.etcherStatus.version = resp.data.etcherstatus.version;
                self.etcherStatus.status = resp.data.etcherstatus.status;
                self.etcherStatus.downloadpercent = resp.data.etcherstatus.downloadpercent;
                self.etcherStatus.downloadstatus = resp.data.etcherstatus.downloadstatus;
                self.lastCheck = resp.data.lastcheck;
            });
    };

    self.__addIpcs = function() {
        electron.on('updater-error', self.__onUpdateError.bind(self));
        electron.on('updater-checking-for-update', self.__onUpdateAvailable.bind(self));
        electron.on('updater-update-available', self.__onUpdateCheckingForUpdate.bind(self));
        electron.on('updater-update-not-available', self.__onUpdateNotAvailable.bind(self));
        electron.on('updater-download-progress', self.__onUpdateDownloadProgress.bind(self));
        electron.on('updater-update-downloaded', self.__onUpdateDownloaded.bind(self));
    };

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

    // handle opening/closing of update task panel according to current cleepdesktop and etcher update status
    self.__handleUpdateTaskPanel = function() {
        if ((self.updatingCleepdesktop || self.updatingEtcher) && self.taskUpdatePanelClosedByUser) {
            // update task panel closed by user, do not open again
        } else if (!self.updatingCleepdesktop && !self.updatingEtcher && self.taskUpdatePanelClosedByUser) {
            // update task panel closed by user but updates terminated, reset flag
            self.taskUpdatePanelClosedByUser = false;
        } else if ((self.updatingCleepdesktop || self.updatingEtcher) && !self.taskUpdatePanel) {
            // no update task panel opened yet while update is in progress, open it
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
        } else if (!self.updatingCleepdesktop && !self.updatingEtcher && self.taskUpdatePanel) {
            // no update is running and task panel is opened, close it
            tasksPanelService.removeItem(self.taskUpdatePanel);
            self.taskUpdatePanel = null;
            self.taskUpdatePanelClosedByUser = false;
        }
    };

    self.__onUpdateError = function(error) {
        // error during update, close task panel
        if (!self.cleepdesktopUpdatesDisabled) {
            // update flags
            self.updatingCleepdesktop = false;
            self.cleepdesktopStatus.status = self.STATUS_ERROR;
            self.cleepdesktopStatus.downloadstatus = self.DOWNLOAD_ERROR;
            self.cleepdesktopStatus.downloadpercent = 100;
            self.cleepdesktopStatus.lasterror = error.message;
            
            // update task panel (delay it to make sure taskpanel is displayed)
            $timeout(function() {
                self.__handleUpdateTaskPanel();
            }, 1500);
        }
    };
    
    self.__onUpdateAvailable = function(info) {
        // update available, open task panel if necessary

        // keep track of changelog
        if (info && info.releaseNotes) {
            self.changelog = info.releaseNotes;
        }

        // update cleepdesktop flags
        self.cleepdesktopUpdateAvailable = true;
        if (!self.cleepdesktopUpdatesDisabled) {
            // update downloading flag
            self.updatingCleepdesktop = true;
            self.cleepdesktopStatus.status = self.STATUS_DOWNLOADING;
            // set to null because download progress is not always available
            self.cleepdesktopStatus.downloadpercent = null;

            // update task panel
            self.__handleUpdateTaskPanel();
        } else {
            // update is disabled, show message to user
            self.taskUpdatePanel = tasksPanelService.addItem(
                'New CleepDesktop version available.', 
                {
                    onAction: self.__goToUpdates,
                    tooltip: 'Go to updates',
                    icon: 'update'
                }
            );
        }
    };
    
    self.__onUpdateCheckingForUpdate = function() {
        // TODO add toast ?
    };

    self.__onUpdateNotAvailable = function(info) {
        logger.info('No CleepDesktop update available');

        // TODO check changelog usage
        if (info) {
            if (info.releaseNotes) {
                self.changelog = info.releaseNotes;
            }
            if (info.version) {
                self.currentVersion = info.version;
            }
        }
    };

    self.__onUpdateDownloadProgress =  function(progress) {
        progress.percent = Math.round(progress.percent);
        logger.debug('Update download progress: ' + progress.percent);
        
        self.cleepdesktopStatus.status = self.STATUS_DOWNLOADING;
        self.cleepdesktopStatus.downloadstatus = self.DOWNLOAD_DOWNLOADING;
        self.cleepdesktopStatus.downloadpercent = progress.percent;
    };
    
    self.__onUpdateDownloaded = function(_info) {
        if (!self.cleepdesktopUpdatesDisabled) {
            self.updatingCleepdesktop = false;
            self.cleepdesktopUpdateAvailable = false;
            self.cleepdesktopStatus.status = self.STATUS_DONE;
            self.cleepdesktopStatus.downloadstatus = self.DOWNLOAD_DONE;
            self.cleepdesktopStatus.downloadpercent = 100;
            self.cleepdesktopStatus.restartrequired = true;
            
            $rootScope.$broadcast('restartrequired');

            self.__handleUpdateTaskPanel();
        }
    };

    self.checkForUpdates = function() {
        logger.info('Check for software updates');
        var defer = $q.defer();

        // check etcher updates first
        var lastCheck = null;
        var etcherUpdateAvailable = true;
        // var cleepdesktopUpdateAvailable = false;
        cleepService.sendCommand('check_updates', 'updates')
            .then(function(resp) {
                // save resp
                lastCheck = resp.data.lastcheck;
                etcherUpdateAvailable = resp.data.updateavailable;

                // then check CleepDesktop updates
                return electron.sendReturn('updater-check-for-updates', null, true);
            }, function(error) {
                logger.error('Error checking etcher updates:' + error);
                defer.reject('etcher');
            })
            .then(function(update) {
                // TODO handle appcontext
                // logger.debug('app-updater result: ' + JSON.stringify(update));
                // if( update && update.versionInfo && update.versionInfo.version && update.versionInfo.version > appContext.version ) {
                //     cleepdesktopUpdateAvailable = true;
                // }
                // defer.resolve(etcherUpdateAvailable || cleepdesktopUpdateAvailable);
            }, function(error) {
                logger.error('Error checking cleepdesktop updates:' + error);
                defer.reject('cleepdesktop')
            })
            .finally(function() {
                // update last check
                self.lastCheck = lastCheck;
                self.__handleUpdateTaskPanel(); 
            })
        
        return defer.promise;
    };

    self.isUpdatingCleepdesktop = function() {
        return self.updatingCleepdesktop;
    };

    self.isUpdatingEtcher = function() {
        return self.updatingEtcher;
    };

    self.isCleepdesktopUpdatesDisabled = function() {
        return self.cleepdesktopUpdatesDisabled;
    };

    self.isCleepdesktopUpdatesAvailable = function() {
        return self.cleepdesktopUpdateAvailable;
    };

    self.getLastCheckTime = function() {
        return self.lastCheck;
    };

    self.isEtcherAvailable = function() {
        if (self.etcherStatus.version === 'v0.0.0' ||
            self.etcherStatus.status === self.STATUS_DOWNLOADING ||
            self.etcherStatus.status === self.STATUS_INSTALLING
        ) {
            return false;
        } else {
            return true;
        }
    };
}]);
