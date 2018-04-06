/**
 * Update service handles CleepDesktop updates using appUdater
 * This service handles properly update taskpanel
 * It can returns Cleepdesktop update status and last error
 */
var updateService = function($rootScope, logger, appUpdater, $timeout, tasksPanelService, cleepUi, $q, cleepService) 
{
    var self = this;

    //status from updates.py
    self.STATUS_IDLE = 0;
    self.STATUS_DOWNLOADING = 1;
    self.STATUS_INSTALLING = 2;
    self.STATUS_DONE = 3;
    self.STATUS_ERROR = 4;

    //status from libs/download.py
    self.DOWNLOAD_IDLE = 0;
    self.DOWNLOAD_DOWNLOADING = 1;
    self.DOWNLOAD_DOWNLOADING_NOSIZE = 2;
    self.DOWNLOAD_ERROR = 3;
    self.DOWNLOAD_ERROR_INVALIDSIZE = 4;
    self.DOWNLOAD_ERROR_BADCHECKSUM = 5;
    self.DOWNLOAD_ERROR_NETWORK = 6;
    self.DOWNLOAD_DONE = 7;

    //members
    self.taskUpdatePanel = null;
    self.taskUpdatePanelClosedByUser = false;
    self.updatingCleepdesktop = false;
    self.updatingEtcher = false;
    self.cleepdesktopUpdatesDisabled = false;
    self.cleepdesktopUpdateAvailable = false;
    self.cleepdesktopStatus = {
        version: appUpdater.currentVersion,
        status: self.STATUS_IDLE,
        downloadpercent: null,
        lasterror: ''
    };
    self.etcherStatus = {
        version: null,
        status: self.STATUS_IDLE,
        downloadpercent: null,
        downloadstatus: null
    };

    //Go to updates page
    self.__goToUpdates = function()
    {
        cleepUi.openPage('updates');
    };

    //On close update task panel
    self.__onCloseUpdateTaskPanel = function()
    {
        //reset variable
        self.taskUpdatePanel = null;
        self.taskUpdatePanelClosedByUser = true;
    };

    //Handle opening/closing of update task panel according to current cleepdesktop and etcher update status
    self.__handleUpdateTaskPanel = function()
    {
        if( (self.updatingCleepdesktop || self.updatingEtcher) && self.taskUpdatePanelClosedByUser )
        {
            //update task panel closed by user, do not open again
        }
        else if( !self.updatingCleepdesktop && !self.updatingEtcher && self.taskUpdatePanelClosedByUser )
        {
            //update task panel closed by user but updates terminated, reset flag
            self.taskUpdatePanelClosedByUser = false;
        }
        else if( (self.updatingCleepdesktop || self.updatingEtcher) && !self.taskUpdatePanel )
        {
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
        }
        else if( !self.updatingCleepdesktop && !self.updatingEtcher && self.taskUpdatePanel )
        {
            //no update is running and task panel is opened, close it
            tasksPanelService.removeItem(self.taskUpdatePanel);
            self.taskUpdatePanel = null;
            self.taskUpdatePanelClosedByUser = false;
        }
    };

    //Init update service adding appUpdater and cleepdesktopcore events handlers
    self.init = function()
    {
        /*if( process.platform==='darwin' )
        {
            //disable auto updates on macos due to missing certification key that is needed :(
            self.cleepdesktopUpdatesDisabled = true;
            appUpdater.autoDownload = false;
            logger.info('Updates are disabled on MacOs because we need to pay 99$ to get Apple Developper ID. ' +
            'If Cleep project earns money one day, we will reconsider that.');
        }*/

        //Handle etcher update here to add update task panel
        $rootScope.$on('updates', function(event, data) {
            if( !data )
                return;

            //update etcher status
            self.etcherStatus.version = data.etcherstatus.version;
            self.etcherStatus.status = data.etcherstatus.status;
            self.etcherStatus.downloadpercent = data.etcherstatus.downloadpercent;
            self.etcherStatus.downloadstatus = data.etcherstatus.downloadstatus;

            //update internal flags
            self.lastUpdateCheck = data.lastUpdateCheck;
            if( data.etcherstatus.status>=3 )
            {
                //etcher update is terminated
                self.updatingEtcher = false;
            }
            else if( !self.taskUpdatePanel && data.etcherstatus.status>0 )
            {
                //etcher update has started
                self.updatingEtcher = true;
            }

            //update task panel
            self.__handleUpdateTaskPanel();
        });

        //Handle cleepdesktop update here to add update task panel
        appUpdater.addListener('update-available', function(info) {
            //update available, open task panel if necessary
            logger.debug('AppUpdater: update-available');

            //update cleepdesktop flags
            self.cleepdesktopUpdateAvailable = true;
            if( !self.cleepdesktopUpdatesDisabled )
            {
                //update downloading flag
                self.updatingCleepdesktop = true;
                self.cleepdesktopStatus.status = self.STATUS_DOWNLOADING;
                //set to null because download progress is not always available
                self.cleepdesktopStatus.downloadpercent = null;

                //update task panel
                self.__handleUpdateTaskPanel();
            }
            else
            {
                //update is disabled, show message to user
                self.taskUpdatePanel = tasksPanelService.addItem(
                    'New CleepDesktop version available.', 
                    {
                        onAction: self.__goToUpdates,
                        tooltip: 'Go to updates',
                        icon: 'update'
                    }
                );
            }
        });
        appUpdater.addListener('update-downloaded', function(info) {
            //update downloaded, close task panel
            logger.debug('AppUpdater: update-downloaded');
            if( !self.cleepdesktopUpdatesDisabled )
            {
                //update flags
                self.updatingCleepdesktop = false;
                self.cleepdesktopUpdateAvailable = false;
                self.cleepdesktopStatus.status = self.STATUS_DONE;
                self.cleepdesktopStatus.downloadstatus = self.DOWNLOAD_DONE;
                self.cleepdesktopStatus.downloadpercent = 100;

                //emit restart required event
                $rootScope.$broadcast('restartrequired');

                //update task panel
                self.__handleUpdateTaskPanel();
            }
        });
        appUpdater.addListener('error', function(error) {
            //error during update, close task panel
            if( !self.cleepdesktopUpdatesDisabled )
            {
                //update flags
                logger.error('AppUpdater: error ' + error.message);
                self.updatingCleepdesktop = false;
                self.cleepdesktopStatus.status = self.STATUS_ERROR;
                self.cleepdesktopStatus.downloadstatus = self.DOWNLOAD_ERROR;
                self.cleepdesktopStatus.downloadpercent = 100;
                self.cleepdesktopStatus.lasterror = error.message;

                //update task panel (delay it to make sure taskpanel is displayed)
                $timeout(function() {
                    self.__handleUpdateTaskPanel();
                }, 1500);
            }
        });
        appUpdater.addListener('download-progress', function(progress) {
            logger.debug('Update download progress: ' + Math.round(progress.percent));
            self.cleepdesktopStatus.status = self.STATUS_DOWNLOADING;
            self.cleepdesktopStatus.downloadstatus = self.DOWNLOAD_DOWNLOADING;
            self.cleepdesktopStatus.downloadpercent = Math.round(progress.percent);
        });
        appUpdater.addListener('checking-for-update', function() {
            logger.info('Checking for CleepDesktop updates...');
        });
        appUpdater.addListener('update-not-available', function(info) {
            logger.info('No CleepDesktop update available');
            logger.debug(info);
        });

        //get initial status
        cleepService.sendCommand('getupdatesstatus')
            .then(function(resp) {
                self.etcherStatus.version = resp.data.etcherstatus.version;
                self.etcherStatus.status = resp.data.etcherstatus.status;
                self.etcherStatus.downloadpercent = resp.data.etcherstatus.downloadpercent;
                self.etcherStatus.downloadstatus = resp.data.etcherstatus.downloadstatus;
                self.lastCheck = resp.data.lastcheck;
            });
    };

    //check for updates
    //@return promise: resolve returns true if update available, false otherwise. Reject returns software that fails ('etcher'|'cleepdesktop')
    self.checkForUpdates = function()
    {
        logger.info('Check for software updates');
        var defer = $q.defer();

        //check etcher updates first
        var lastCheck = null;
        var etcherUpdateAvailable = true;
        var cleepdesktopUpdateAvailable = false;
        cleepService.sendCommand('checkupdates')
            .then(function(resp) {
                //save resp
                lastCheck = resp.data.lastcheck;
                etcherUpdateAvailable = resp.data.updateavailable;

                //then check CleepDesktop updates
                return appUpdater.checkForUpdates();
            }, function(error) {
                logger.error('Error checking etcher updates:' + error);
                defer.reject('etcher');
            })
            .then(function(update) {
                logger.debug('app-updater result: ' + JSON.stringify(update));
                if( update && update.versionInfo && update.versionInfo.version && update.versionInfo.version!==cleepdesktopVersion )
                {
                    cleepdesktopUpdateAvailable = true;
                }
                defer.resolve(etcherUpdateAvailable || cleepdesktopUpdateAvailable);
            }, function(error) {
                logger.error('Error checking cleepdesktop updates:' + error);
                defer.reject('cleepdesktop')
            })
            .finally(function() {
                //update last check
                self.lastCheck = lastCheck;
            })
        
        return defer.promise;
    };

    // Return Cleepdesktop update status
    self.isUpdatingCleepdesktop = function()
    {
        return self.updatingCleepdesktop;
    };

    // Return Etcher update status
    self.isUpdatingEtcher = function()
    {
        return self.updatingEtcher;
    };

    //Is cleepdesktop updates disabled
    self.isCleepdesktopUpdatesDisabled = function()
    {
        return self.cleepdesktopUpdatesDisabled;
    };

    //Is cleepdesktop updates available
    self.isCleepdesktopUpdatesAvailable = function()
    {
        return self.cleepdesktopUpdateAvailable;
    };

    //Get last check time
    self.getLastCheckTime = function()
    {
        return self.lastCheck;
    };

    //Return true if etcher is available (installed and no update in progress)
    self.isEtcherAvailable = function()
    {
        if( self.etcherStatus.version=='v0.0.0' || self.etcherStatus.status==self.STATUS_DOWNLOADING || self.etcherStatus.status==self.STATUS_INSTALLING )
        {
            return false;
        }
        else
        {
            return true;
        }
    };
};
    
var Cleep = angular.module('Cleep');
Cleep.service('updateService', ['$rootScope', 'logger', 'appUpdater', '$timeout', 'tasksPanelService', 'cleepUi', 
            '$q', 'cleepService', updateService]);
