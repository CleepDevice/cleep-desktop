var Cleep = angular.module('Cleep')

/**
 * Updates controller
 */
var updatesController = function($rootScope, $scope, cleepService, toast, logger, appUpdater, $timeout)
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

    //check for updates
    self.checkUpdates = function() {
        self.loading = true;

        //check etcher updates
        cleepService.sendCommand('checkupdates')
            .then(function(resp) {
                if( resp.data.updateavailable===false )
                {
                    logger.info('No etcher update available');
                    toast.info('No update available');
                }
                else
                {
                    toast.sucess('Etcher update available');
                }
                self.lastcheck = resp.data.lastcheck;

                //check CleepDesktop updates now
                return appUpdater.checkForUpdates();
            })
            .then(function(update) {
                
            }, function(error) {
                logger.error('Error checking CleepDesktop updates: ' + error);
            })
            .finally(function() {
                self.loading = false;
            });
    };

    //updater events
    appUpdater.addListener('checking-for-update', function() {
        logger.info('Checking for CleepDesktop updates...');
    });
    appUpdater.addListener('update-available', function(info) {
        logger.info('CleepDesktop update available', info);
        $timeout(function() {
            self.cleepdesktopStatus.status = self.STATUS_DOWNLOADING;
            self.cleepdesktopStatus.downloadstatus = self.DOWNLOAD_DOWNLOADING;
            self.cleepdesktopStatus.downloadpercent = null;
        }, 500);
    });
    appUpdater.addListener('update-not-available', function(info) {
        logger.info('No CleepDesktop update available', info);
    });
    appUpdater.addListener('update-downloaded', function(info) {
        logger.info('CleepDesktop update downloaded', info);
        $timeout(function() {
            self.cleepdesktopStatus.status = self.STATUS_DONE;
            self.cleepdesktopStatus.downloadstatus = self.DOWNLOAD_DONE;
            self.cleepdesktopStatus.downloadpercent = 100;
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
        logger.info('Update download progress: ' + progress.percent);
        self.cleepdesktopStatus.status = self.STATUS_DOWNLOADING;
        self.cleepdesktopStatus.downloadstatus = self.DOWNLOAD_DOWNLOADING;
        self.cleepdesktopStatus.downloadpercent = progress.percent;
    });

    //init controller
    self.init = function() {
        //get current status
        cleepService.sendCommand('getupdatesstatus')
            .then(function(resp) {
                self.etcherStatus = resp.data.etcherstatus;
                self.lastcheck = resp.data.lastcheck;
            });
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
Cleep.controller('updatesController', ['$rootScope', '$scope', 'cleepService', 'toastService', 'logger', 'appUpdater', '$timeout', updatesController]);

