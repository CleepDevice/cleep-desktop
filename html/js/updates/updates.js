/**
 * Updates controller
 */
angular
.module('Cleep')
.controller('updatesController', ['$rootScope', 'toastService', 'updateService', 'modalService',
function($rootScope, toast, updateService, modalService) {
    var self = this;
    self.cleepdesktopStatus = updateService.cleepdesktopStatus;
    self.etcherStatus = updateService.etcherStatus;
    self.loading = false;
    self.updateService = updateService;
    self.closeModal = modalService.closeModal;

    // open changelog dialog
    self.openChangelog = function() {
        modalService.open('updatesController', 'js/updates/changelog-dialog.html');
    };

    // is cleepdesktop updates disabled
    self.isCleepdesktopUpdatesDisabled = function() {
        return updateService.isCleepdesktopUpdatesDisabled();
    };
    
    // is cleepdesktop updates disabled
    self.isCleepdesktopUpdatesAvailable = function() {
        return updateService.isCleepdesktopUpdatesAvailable();
    };

    // get last check time
    self.getLastCheckTime = function() {
        return updateService.getLastCheckTime();
    };

    // return true if update is in progress
    self.isUpdating = function() {
        return updateService.updatingCleepdesktop || updateService.updatingEtcher;
    };

    // restart application
    self.restart = function() {
        $rootScope.$broadcast('restart');
    };

    // check for updates
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

}]);
