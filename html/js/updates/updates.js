var Cleep = angular.module('Cleep')

/**
 * Updates controller
 */
var updatesController = function($rootScope, toast, updateService, modalService)
{
    var self = this;
    self.cleepdesktopStatus = updateService.cleepdesktopStatus;
    self.etcherStatus = updateService.etcherStatus;
    self.loading = false;
    self.updateService = updateService;
    self.closeModal = modalService.closeModal;

    //Open changelog dialog
    self.openChangelog = function() {
        modalService.open('updatesController', 'js/updates/changelog-dialog.html');
    };

    //Is cleepdesktop updates disabled
    self.isCleepdesktopUpdatesDisabled = function() {
        return updateService.isCleepdesktopUpdatesDisabled();
    };
    
    //Is cleepdesktop updates disabled
    self.isCleepdesktopUpdatesAvailable = function() {
        return updateService.isCleepdesktopUpdatesAvailable();
    };

    //Get last check time
    self.getLastCheckTime = function() {
        return updateService.getLastCheckTime();
    };

    //Return true if update is in progress
    self.isUpdating = function() {
        return updateService.updatingCleepdesktop || updateService.updatingEtcher;
    };

    //Restart application
    self.restart = function() {
        $rootScope.$broadcast('restart');
    };

    //Check for updates
    self.checkUpdates = function() {
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
            });
    };

};
Cleep.controller('updatesController', ['$rootScope', 'toastService', 'updateService', 'modalService', updatesController]);
