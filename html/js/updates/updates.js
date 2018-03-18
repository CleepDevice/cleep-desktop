var Cleep = angular.module('Cleep')

/**
 * Updates controller
 */
var updatesController = function($rootScope, $scope, cleepService, toast, logger, appUpdater, $timeout, 
    cleepdesktopVersion, updateService)
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

    self.lastcheck = null;
    self.etcherStatus = null;
    self.cleepdesktopStatus = {
        version: appUpdater.currentVersion,
        status: self.STATUS_IDLE,
        downloadstatus: self.DOWNLOAD_IDLE,
        downloadpercent: 0
    };
    self.loading = false;

    //Get last error from cleepdesktop update (from updateService)
    self.getLastCleepdesktopUpdateError = function() {
        return updateService.getLastCleepdesktopUpdateError();
    };

    //Is cleepdesktop updates disabled
    self.isCleepdesktopUpdatesDisabled = function()
    {
        return updateService.isCleepdesktopUpdatesDisabled();
    };
    
    //Is cleepdesktop updates disabled
    self.isCleepdesktopUpdatesAvailable = function()
    {
        return updateService.isCleepdesktopUpdatesAvailable();
    };

    //check for updates
    self.checkUpdates = function() {
        self.loading = true;
        self.etcherUpdate = false;
        self.cleepdesktopUpdate = false;

        //check etcher updates
        cleepService.sendCommand('checkupdates')
            .then(function(resp) {
                //save resp
                self.etcherUpdate = resp.data.updateavailable;
                self.lastcheck = resp.data.lastcheck;

                //check CleepDesktop updates now
                return updateService.checkForUpdates();
            }, function(error) {
                logger.error('Error checking etcher updates:' + error);
                toast.error('Error checking updates');
            })
            .then(function(update) {
                logger.debug('app-updater result: ' + JSON.stringify(update));
                if( update && update.versionInfo && update.versionInfo.version && update.versionInfo.version!==cleepdesktopVersion )
                {
                    self.cleepdesktopUpdate = true;
                }
            }, function(error) {
                logger.error('Error checking cleepdesktop updates:' + error);
                toast.error('Error checking updates');
            })
            .finally(function() {
                self.loading = false;

                if( self.etcherUpdate || self.cleepdesktopUpdate )
                {
                    toast.info('Update available. Update will start.');
                }
                else
                {
                    toast.info('No update available');
                }
            });
    };

    //appUpdater events
    appUpdater.addListener('checking-for-update', function() {
        logger.info('Checking for CleepDesktop updates...');
    });
    appUpdater.addListener('update-available', function(info) {
        logger.info('CleepDesktop update available');
        logger.debug(info);
        $timeout(function() {
            self.cleepdesktopStatus.status = self.STATUS_DOWNLOADING;
            self.cleepdesktopStatus.downloadstatus = self.DOWNLOAD_DOWNLOADING;
            self.cleepdesktopStatus.downloadpercent = null;
        }, 500);
    });
    appUpdater.addListener('update-not-available', function(info) {
        logger.info('No CleepDesktop update available');
        logger.debug(info);
    });
    appUpdater.addListener('update-downloaded', function(info) {
        logger.info('CleepDesktop update downloaded');
        logger.debug(info);
        $timeout(function() {
            self.cleepdesktopStatus.status = self.STATUS_DONE;
            self.cleepdesktopStatus.downloadstatus = self.DOWNLOAD_DONE;
            self.cleepdesktopStatus.downloadpercent = 100;

            //emit restart required event
            $rootScope.$broadcast('restartrequired');

        }, 500);
    });
    appUpdater.addListener('error', function(error) {
        logger.error('Error occured during CleepDesktop update:' + error);
        $timeout(function() {
            self.cleepdesktopStatus.status = self.STATUS_ERROR;
            self.cleepdesktopStatus.downloadstatus = self.DOWNLOAD_ERROR;
            self.cleepdesktopStatus.downloadpercent = 100;
        }, 500);
    });
    appUpdater.addListener('download-progress', function(progress) {
        logger.debug('Update download progress: ' + progress.percent);
        self.cleepdesktopStatus.status = self.STATUS_DOWNLOADING;
        self.cleepdesktopStatus.downloadstatus = self.DOWNLOAD_DOWNLOADING;
        self.cleepdesktopStatus.downloadpercent = progress.percent;
    });

    //init controller
    self.init = function() {
        //get current etcher status
        cleepService.sendCommand('getupdatesstatus')
            .then(function(resp) {
                self.etcherStatus = resp.data.etcherstatus;
                self.lastcheck = resp.data.lastcheck;
            });

        //get current cleepdesktop status
        if( updateService.isUpdatingCleepdesktop() )
        {
            self.cleepdesktopStatus.status = self.STATUS_DOWNLOADING;
            self.cleepdesktopStatus.downloadstatus = self.DOWNLOAD_DOWNLOADING;
            self.cleepdesktopStatus.downloadpercent = null;
        }
        else if( updateService.getLastCleepdesktopUpdateError() )
        {
            self.cleepdesktopStatus.status = self.STATUS_ERROR;
            self.cleepdesktopStatus.downloadstatus = self.DOWNLOAD_ERROR;
            self.cleepdesktopStatus.downloadpercent = 100;
        }

    };
    self.init();

    //handle python updates update
    $rootScope.$on('updates', function(event, data) {
        if( data )
        {
            self.etcherStatus = data.etcherstatus;
            self.lastcheck = data.lastcheck;
        }
    });

};
Cleep.controller('updatesController', ['$rootScope', '$scope', 'cleepService', 'toastService', 'logger', 'appUpdater', 
                                        '$timeout', 'cleepdesktopVersion', 'updateService', updatesController]);

