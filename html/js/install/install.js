/**
 * Install controller
 */
angular
.module('Cleep')
.controller('installController', ['$rootScope', 'toastService', 'confirmService', 'loggerService', 'updateService', 
                                'installService', 'modalService', 'cleepService', 'downloadService',
function($rootScope, toast, confirm, logger, updateService, installService, modalService, cleepService, downloadService) {

    var self = this;
    self.prefs = null;
    self.installService = installService;

    self.$onInit = function() {
        cleepService.getConfig()
            .then(function(resp) {
                self.prefs = resp.data.config.cleep;
            });

        installService.getStatus();
    };

    self.gotoManualInstall = function() {
        $rootScope.$broadcast('open-page', 'installManually');
    };

    self.openIsoDialog = function() {
        modalService.open('isoController', 'js/install/iso-dialog.html')
            .then(function(res) {
                self.installService.installConfig.iso = res;
            })
            .catch(() => { /* handle rejection */ });
    };

    self.openDriveDialog = function() {
        modalService.open('driveController', 'js/install/drive-dialog.html')
            .then(function(res) {
                self.installService.installConfig.drive = res;
            })
            .catch(() => { /* handle rejection */ });
    };

    //open wifi dialog
    self.openWifiDialog = function() {
        modalService.open('wifiController', 'js/install/wifi-dialog.html', {
            wifiChoice: self.installService.installConfig.wifiChoice,
        })
            .then(function(res) {
                self.installService.installConfig.wifi = res;
            })
            .catch(() => { /* handle rejection */ });
    };

    self.resetFields = function() {
        logger.debug('Reset fields');
        self.installService.installConfig.drive = null;
        self.installService.installConfig.iso = null;
        self.installService.installConfig.wifiChoice = 0;
        self.installService.installConfig.wifi = null;
    };

    self.isFlashtoolAvailable = function() {
        return !!updateService.flashToolUpdate?.version;
    }

    self.startInstall = function() {
        if( !self.installService.installConfig.iso || !self.installService.installConfig.drive ) {
            toast.error('Please select a Cleep version and a drive');
            return;
        }
        if( self.installService.installConfig.wifiChoice!==0 && !self.installService.installConfig.wifi ) {
            toast.error('Please configure wifi');
            return;
        }

        logger.debug('url=' + self.installService.installConfig.iso.url);
        logger.debug('drive=' + self.installService.installConfig.drive.path);
        logger.debug('wifi=' + JSON.stringify(self.installService.installConfig.wifi));
        
        confirm.open('Confirm installation?', 'Installation will erase all drive content. This operation cannot be reversed!<br/> \
                      Please note that admin permissions may be requested after file download.', 'Yes, install', 'No')
            .then(function() {
                $rootScope.$broadcast('disablequit');

                var data = {
                    url: self.installService.installConfig.iso.url,
                    drive: self.installService.installConfig.drive.path,
                    wifi: self.installService.installConfig.wifi
                };
                logger.debug('Flash data:', data);

                installService.startInstall(data)
                    .then(function() {
                        toast.info('Installation started');
                    }, function() {
                        // no toast here, if error occured with command, it should returns an exception that is catched
                        // and toasted by cleepService
                        $rootScope.$broadcast('enablequit');
                    });
            })
            .catch(() => { /* handle rejection */ });
    };

    self.cancelInstall = function() {
        if( !self.installService.status ) {
            return;
        }

        // check if process is running
        if (self.installService.status.status>=self.installService.STATUS.DONE) {
            self.logger.debug('CancelFlash: invalid status [' + self.installService.status.status + '] do nothing');
            return;
        }

        if (self.installService.status.status===self.installService.STATUS.DOWNLOADING ||
            self.installService.status.status===self.installService.STATUS.DOWNLOADING_NOSIZE) {
            confirm.open('Cancel installation?', null, 'Yes', 'No')
                .then(function() {
                    installService.cancelInstall();
                });
        } else if (self.installService.status.status===self.installService.STATUS.FLASHING ||
            self.installService.status.status===self.installService.STATUS.VALIDATING) {
            confirm.open('Cancel installation?', 'Canceling installation during this step of process will put your removable media in inconsistant state.', 'Yes, cancel', 'No, continue')
                .then(function() {
                    installService.cancelInstall();
                })
                .catch(() => { /* handle rejection */ });
        } else if (self.installService.status.status===self.installService.STATUS.REQUEST_WRITE_PERMISSIONS) {
            //can cancel if permissions is blocked. Can happen if user take too much time filling password
            confirm.open('Cancel installation?', null, 'Yes', 'No')
                .then(function() {
                    installService.cancelInstall();
                })
                .catch(() => { /* handle rejection */ });
        } else {
            logger.debug('Nothing to do with current status [' + self.installService.status.status + ']'); 
        }
    };

    self.downloadIso = function() {
        downloadService.downloadUrl(self.installService.installConfig.iso.url);
    };

}]);
