var Cleep = angular.module('Cleep')

/**
 * Updates controller
 */
var updatesController = function($rootScope, $scope, cleepService, toast, logger, appUpdater, $timeout, cleepdesktopVersion, updateService)
{
    var self = this;
    self.cleepdesktopStatus = updateService.cleepdesktopStatus;
    self.etcherStatus = updateService.etcherStatus;
    self.loading = false;

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

    //Get last check time
    self.getLastCheckTime = function()
    {
        return updateService.getLastCheckTime();
    };

    //Return true if update is in progress
    self.isUpdating = function()
    {
        return updateService.isUpdatingCleepdesktop() || updateService.isUpdatingEtcher();
    };

    //Check for updates
    self.checkUpdates = function()
    {
        self.loading = true;
        updateService.checkForUpdates()
            .then(function(updateAvailable) {
                if( updateAvailable )
                    toast.success('Updates available');
                else
                    toast.info('No update available');
            }, function() {
                toast.error('Error checking updates');
            })
            .finally(function() {
                self.loading = false;
            })
    };

};
Cleep.controller('updatesController', ['$rootScope', '$scope', 'cleepService', 'toastService', 'logger', 'appUpdater', 
                                        '$timeout', 'cleepdesktopVersion', 'updateService', updatesController]);

