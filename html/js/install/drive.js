var Cleep = angular.module('Cleep')

/**
 * Drive select controller
 */
var driveSelectController = function(closeModal, installService, toast)
{
    var self = this;
    self.closeModal = closeModal;
    self.drives = installService.drives;
    self.loading = true;
    self.minSize = 3600000000;

    //controller init
    self.$onInit = function () {
        self.refreshDrives();
    };

    //refresh drives list
    self.refreshDrives = function()
    {
        self.loading = true;
        
        installService.refreshDrives()
            .then(function() {
                self.loading = false;
            });
    };

    //select drive
    self.selectDrive = function(drive)
    {
        if( drive.readonly || drive.size<self.minSize ) {
            toast.error('Please select valid drive');
            return;
        }

        self.closeModal(drive);
    };

};
Cleep.controller('driveSelectController', ['closeModal', 'installService', 'toastService', driveSelectController]);
