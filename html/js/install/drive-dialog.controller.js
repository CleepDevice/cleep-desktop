/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-this-alias */
angular
.module('Cleep')
.controller('driveController', ['closeModal', 'installService', 'toastService', '$rootScope',
function(closeModal, installService, toast, $rootScope) {
    var self = this;
    self.installService = installService;
    self.closeModal = closeModal;
    self.loading = true;
    self.minSize = 3600000000;

    self.$onInit = function () {
        self.refreshDrives();
    };

    self.refreshDrives = function() {
        self.loading = true;
        self.installService.refreshDriveList()
            .finally(() => {
                self.loading = false;
            });
    };

    self.selectDrive = function(drive) {
        if (drive.size < self.minSize) {
            toast.error('Please select valid drive');
            return;
        }
        self.closeModal(drive);
    };

    self.gotoUpdates = function() {
        $rootScope.$broadcast('open-page', { page: 'updates' });
    };
}]);