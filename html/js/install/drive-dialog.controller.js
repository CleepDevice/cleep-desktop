angular
.module('Cleep')
.controller('driveController', ['closeModal', 'installService', 'toastService', '$timeout',
function(closeModal, installService, toast, $timeout) {

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

}]);