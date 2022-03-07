/**
 * Updates controller
 */
angular
.module('Cleep')
.controller('updatesController', ['$rootScope', 'toastService', 'updateService', 'modalService', 'electronService',
function($rootScope, toast, updateService, modalService, electron) {

    var self = this;
    self.loading = false;
    self.updateService = updateService;
    self.closeModal = modalService.closeModal;

    self.openChangelog = function() {
        modalService.open('updatesController', 'js/updates/changelog-dialog.html', {}, {changelog: self.loadChangelog});
    };

    self.loadChangelog = function() {
        return electron.sendReturn('get-changelog')
            .then((changelog) => {
                return changelog;
            });
    };

    self.restartApplication = function() {
        $rootScope.$broadcast('restartrequired');
    };

    self.checkForUpdates = function() {
        self.loading = true;
        updateService.checkForUpdates()
            .then((hasUpdate) => {
                if (!hasUpdate) {
                    toast.info('No update available');
                }
            })
            .finally(() => {
                self.loading = false;
            });
    };

}]);
