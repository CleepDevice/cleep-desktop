/**
 * Install controller
 */
angular
.module('Cleep')
.controller('installController', ['$rootScope', 'toastService', 'confirmService', 'logger', 'updateService', 
                                'installService', 'modalService', 'cleepService',
function($rootScope, toast, confirm, logger, updateService, installService, modalService, cleepService) {
    var self = this;
    self.modal = modalService;
    self.prefs = null;
    self.installService = installService;

    //initialize
    self.$onInit = function()
    {
        cleepService.getConfig()
            .then(function(resp) {
                self.prefs = resp.data.config.cleep;
            });

        //get install status
        installService.getStatus();
    };

    //open manual install
    self.gotoManualInstall = function()
    {
        cleepUi.openPage('installManually');
    };

    //open iso dialog
    self.openIsoDialog = function() {
        self.modal.open('isoController', 'js/install/iso-dialog.html')
            .then(function(res) {
                self.installService.installConfig.iso = res;
            });
    };

    //open drive dialog
    self.openDriveDialog = function() {
        self.modal.open('driveController', 'js/install/drive-dialog.html')
            .then(function(res) {
                self.installService.installConfig.drive = res;
            });
    };

    //open wifi dialog
    self.openWifiDialog = function() {
        self.modal.open('wifiController', 'js/install/wifi-dialog.html', {
            wifiChoice: self.installService.installConfig.wifiChoice,
        })
            .then(function(res) {
                self.installService.installConfig.wifi = res;
            });
    };

    //reset form fields
    self.resetFields = function()
    {
        logger.debug('Reset fields');
        self.installService.installConfig.drive = null;
        self.installService.installConfig.iso = null;
        self.installService.installConfig.wifiChoice = 0;
        self.installService.installConfig.wifi = null;
    };

    //return etcher availability
    self.isEtcherAvailable = function()
    {
        return updateService.isEtcherAvailable();
    }

    //start install process
    self.startInstall = function()
    {
        //check values
        if( !self.installService.installConfig.iso || !self.installService.installConfig.drive )
        {
            toast.error('Please select a Cleep version and a drive');
            return;
        }
        if( self.installService.installConfig.wifiChoice!==0 && !self.installService.installConfig.wifi )
        {
            toast.error('Please configure wifi');
            return;
        }

        logger.debug('url=' + self.installService.installConfig.iso.url);
        logger.debug('drive=' + self.installService.installConfig.drive.path);
        logger.debug('wifi=' + JSON.stringify(self.installService.installConfig.wifi));
        
        confirm.open('Confirm installation?', 'Installation will erase all drive content. This operation cannot be reversed!<br/> \
                      Please note that admin permissions may be requested after file download.', 'Yes, install', 'No')
            .then(function() {
                //disable application quit
                $rootScope.$broadcast('disablequit');

                //prepare data
                var data = {
                    url: self.installService.installConfig.iso.url,
                    drive: self.installService.installConfig.drive.path,
                    wifi: self.installService.installConfig.wifi
                };
                logger.debug('Flash data:', data);

                //launch flash process
                installService.startInstall(data)
                    .then(function() {
                        toast.info('Installation started');
                    }, function(err) {
                        //no toast here, if error occured with command, it should return an exception that is catched
                        //and toasted by cleepService
                        $rootScope.$broadcast('enablequit');
                    });
            });
    };

    //cancel flash process
    self.cancelInstall = function()
    {
        if( !self.installService.status )
        {
            return;
        }

        //check if process is running
        if( self.installService.status.status>=self.installService.STATUS.DONE )
        {
            self.logger.debug('CancelFlash: invalid status [' + self.installService.status.status + '] do nothing');
            return;
        }

        if( self.installService.status.status===self.installService.STATUS.DOWNLOADING || 
            self.installService.status.status===self.installService.STATUS.DOWNLOADING_NOSIZE )
        {
            confirm.open('Cancel installation?', null, 'Yes', 'No')
                .then(function() {
                    installService.cancelInstall();
                });
        }
        else if( self.installService.status.status===self.installService.STATUS.FLASHING ||
            self.installService.status.status===self.installService.STATUS.VALIDATING )
        {
            confirm.open('Cancel installation?', 'Canceling installation during this step of process will put your removable media in inconsistant state.', 'Yes, cancel', 'No, continue')
                .then(function() {
                    installService.cancelInstall();
                });
        }
        else if( self.installService.status.status===self.installService.STATUS.REQUEST_WRITE_PERMISSIONS )
        {
            //can cancel if permissions is blocked. Can happen if user take too much time filling password
            confirm.open('Cancel installation?', null, 'Yes', 'No')
                .then(function() {
                    installService.cancelInstall();
                });
        }
        else
        {
            logger.debug('Nothing to do with current status [' + self.installService.status.status + ']'); 
        }
    };

    //download iso file
    self.downloadIso = function()
    {
        $rootScope.$broadcast('download-file', {url: self.installService.installConfig.iso.url});
    };

}]);
