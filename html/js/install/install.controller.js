angular
.module('Cleep')
.controller('installController', ['$rootScope', 'toastService', 'confirmService', 'loggerService', 'updateService', 
                                'installService', 'modalService',
function($rootScope, toast, confirm, logger, updateService, installService, modalService) {

    var self = this;
    self.installService = installService;
    self.updateService = updateService;

    self.gotoManualInstall = function() {
        $rootScope.$broadcast('open-page', 'installManually');
    };

    self.openIsoDialog = function() {
        modalService.open('isoDialogController', 'js/install/iso-dialog.html')
            .then((iso) => {
                logger.debug('Selected iso', iso);
                self.installService.installConfig.iso = iso;
            })
            .catch(() => { /* handle rejection */ });
    };

    self.openDriveDialog = function() {
        modalService.open('driveController', 'js/install/drive-dialog.html')
            .then(function(drive) {
                logger.debug('Selected drive', drive);
                self.installService.installConfig.drive = drive;
            })
            .catch(() => { /* handle rejection */ });
    };

    self.openWifiDialog = function() {
        modalService.open('wifiController', 'js/install/wifi-dialog.html', {
            network: self.installService.installConfig.network,
        })
            .then(function(wifi) {
                logger.debug('Selected wifi', wifi);
                self.installService.installConfig.wifi = wifi;
            })
            .catch(() => { /* handle rejection */ });
    };

    self.startInstall = function() {
        if (!self.installService.installConfig.iso || !self.installService.installConfig.drive) {
            toast.error('Please select a Cleep version and a drive');
            return;
        }
        if (self.installService.installConfig.network !== 0 && !self.installService.installConfig.wifi) {
            toast.error('Please configure wifi');
            return;
        }

        logger.debug('Installation config', self.installService.installConfig);
        
        confirm.open('Confirm installation?', 'Installation will erase all drive content. This operation cannot be reversed!<br/> \
                      Please note that admin permissions will be requested after file download.', 'Yes, install', 'No')
            .then(() => {
                installService.startInstall();
            })
            .catch((error) => { logger.debug('CANCELED', {error}); /* handle rejection */ });
    };

    self.cancelInstall = function() {
        installService.cancelInstall();
    };
}]);
