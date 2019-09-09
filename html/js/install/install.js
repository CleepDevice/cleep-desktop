var Cleep = angular.module('Cleep');
const { dialog } = require('electron').remote;
var path = require('electron').remote.require('path');

/**
 * Install controller
 */
var installController = function($rootScope, toast, confirm, logger, updateService, installService, modalService, cleepService)
{
    var self = this;
    self.flashing = false;
    self.modal = modalService;
    self.prefs = null;
    self.config = installService.flashConfig;
    self.status = installService.status;
    self.STATUS = {
        IDLE: 0,
        DOWNLOADING: 1,
        DOWNLOADING_NOSIZE: 2,
        FLASHING: 3,
        VALIDATING: 4,
        REQUEST_WRITE_PERMISSIONS: 5,
        DONE: 6,
        CANCELED: 7,
        ERROR: 8,
        ERROR_INVALIDSIZE: 9,
        ERROR_BADCHECKSUM: 10,
        ERROR_FLASH: 11,
        ERROR_NETWORK: 12,
    };

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
                self.config.iso = res;
            });
    };

    //open drive dialog
    self.openDriveDialog = function() {
        self.modal.open('driveController', 'js/install/drive-dialog.html')
            .then(function(res) {
                self.config.drive = res;
            });
    };

    //open wifi dialog
    self.openWifiDialog = function() {
        self.modal.open('wifiController', 'js/install/wifi-dialog.html', {
            wifiChoice: self.config.wifiChoice,
        })
            .then(function(res) {
                self.config.wifi = res;
            });
    };

    //reset form fields
    self.resetFields = function()
    {
        logger.debug('Reset fields');
        self.config.drive = null;
        self.config.iso = null;
        self.config.wifiChoice = 0;
        self.config.wifi = null;
    };

    //return etcher availability
    self.isEtcherAvailable = function()
    {
        return updateService.isEtcherAvailable();
    }

    //start flash process
    self.startFlash = function()
    {
        //check values
        if( !self.config.iso || !self.config.drive )
        {
            toast.error('Please select a Cleep version and a drive');
            return;
        }
        if( self.config.wifiChoice!==0 && !self.config.wifi )
        {
            toast.error('Please configure wifi');
            return;
        }

        logger.debug('url=' + self.config.iso.url);
        logger.debug('drive=' + self.config.drive.path);
        logger.debug('wifi=' + JSON.stringify(self.config.wifi));
        
        confirm.open('Confirm installation?', 'Installation will erase all drive content. This operation cannot be reversed!<br/> \
                      Please note that admin permissions may be requested after file download.', 'Yes, install', 'No')
            .then(function() {
                //disable application quit
                $rootScope.$broadcast('disablequit');

                //prepare data
                self.flashing = true;
                var data = {
                    url: self.config.iso.url,
                    drive: self.config.drive.path,
                    wifi: self.config.wifi
                };
                logger.debug('Flash data:', data);

                //launch flash process
                installService.startFlash(data)
                    .then(function() {
                        toast.info('Installation started');
                    }, function(err) {
                        //no toast here, if error occured with command, it should return an exception that is catched
                        //and toasted by cleepService
                        self.flashing = false;
                        $rootScope.$broadcast('enablequit');
                    });
            });
    };

    //cancel flash process
    self.cancelFlash = function()
    {
        if( !self.status )
        {
            return;
        }

        //check if process is running
        if( self.status.status>=self.STATUS.DONE )
        {
            self.logger.debug('CancelFlash: invalid status [' + self.status.status + '] do nothing');
            return;
        }

        if( self.status.status===self.STATUS.DOWNLOADING || self.status.status===self.STATUS.DOWNLOADING_NOSIZE )
        {
            confirm.open('Cancel installation?', null, 'Yes', 'No')
                .then(function() {
                    installService.cancelFlash();
                });
        }
        else if( self.status.status===self.STATUS.FLASHING || self.status.status===self.STATUS.VALIDATING )
        {
            confirm.open('Cancel installation?', 'Canceling installation during this step of process will put your removable media in inconsistant state.', 'Yes, cancel', 'No, continue')
                .then(function() {
                    installService.cancelFlash();
                });
        }
        else if( self.status.status===self.STATUS.REQUEST_WRITE_PERMISSIONS )
        {
            //can cancel if permissions is blocked. Can happen if user take too much time filling password
            confirm.open('Cancel installation?', null, 'Yes', 'No')
                .then(function() {
                    installService.cancelFlash();
                });
        }
        else
        {
            logger.debug('Nothing to do with current status [' + self.status.status + ']'); 
        }
    };

    //download iso file
    self.downloadIso = function()
    {
        $rootScope.$broadcast('download-file', {url: self.config.iso.url});
    };

    //flash update received
    $rootScope.$on('install', function(_event, data) {
        if( !data )
        {
            return;
        }

        //save status
        var flashing = self.flashing;
        self.status = data;

        //enable/disable flash button
        logger.debug('=> current status: ' + self.status.status, self.status);
        if( self.status.status===self.STATUS.IDLE || self.status.status>=self.STATUS.DONE )
        {
            self.flashing = false;
        }
        else
        {
            self.flashing = true;
        }

        //end of flash
        if( self.flashing==false && flashing!=self.flashing )
        {
            logger.info('Flashing is terminated. Restore ui');

            //suppress warning dialog
            $rootScope.$broadcast('enablequit');
        }

        //force angular refresh
        $rootScope.$apply();
        $rootScope.$digest();
    });

};

Cleep.controller('installController', ['$rootScope', 'toastService', 'confirmService', 'logger', 'updateService', 
                                        'installService', 'modalService', 'cleepService', installController]);


