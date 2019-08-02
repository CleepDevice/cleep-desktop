var Cleep = angular.module('Cleep');
const { dialog } = require('electron').remote;
var path = require('electron').remote.require('path');

/**
 * Install controller
 */
var installController = function($rootScope, cleepService, toast, confirm, logger, updateService, installService, modalService)
{
    var self = this;
    self.status = {
        percent: 0,
        total_percent: 0,
        status: 0,
        eta: ''
    };
    self.flashing = false;
    self.modal = modalService;
    self.selectedDrive = null;
    self.selectedIso = null;
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

    //wifi variables
    self.selectedWifiChoice = 0;
    self.wifiConfig = null;

    //initialize
    self.$onInit = function()
    {
        //get flash status
        self.getStatus();
    };

    //open manual install
    self.gotoManualInstall = function()
    {
        cleepUi.openPage('installManually');
    };

    //open iso dialog
    self.openIsoDialog = function() {
        self.modal.open('isoSelectController', 'js/install/isoselect-dialog.html')
            .then(function(res) {
                self.selectedIso = res;
            });
    };

    //open drive dialog
    self.openDriveDialog = function() {
        self.modal.open('driveSelectController', 'js/install/driveselect-dialog.html')
            .then(function(res) {
                self.selectedDrive = res;
            });
    };

    //open wifi dialog
    self.openWifiDialog = function() {
        self.modal.open('wifiController', 'js/install/wifi-dialog.html', {
            selectedWifiChoice: self.selectedWifiChoice,
        })
            .then(function(res) {
                self.wifiConfig = res;
            });
    };

    //reset form fields
    self.resetFields = function()
    {
        logger.debug('Reset fields');
        self.selectedDrive = null;
        self.selectedIso = null;
        self.selectedWifiChoice = 0;
        self.wifiConfig = null;
    };

    //return current flash status
    self.getStatus = function()
    {
        return cleepService.sendCommand('getflashstatus')
            .then(function(resp) {
                self.status = resp.data;
            });
    };

    //Return etcher availability
    self.isEtcherAvailable = function()
    {
        return updateService.isEtcherAvailable();
    }

    //start flash process
    self.startFlash = function()
    {
        //check values
        if( !self.selectedIso || !self.selectedDrive )
        {
            toast.error('Please select a Cleep version and a drive');
            return;
        }
        if( self.selectedWifiChoice!==0 && !self.wifiConfig )
        {
            toast.error('Please configure wifi');
            return;
        }

        logger.debug('url=' + self.selectedIso.url);
        logger.debug('drive=' + self.selectedDrive.path);
        logger.debug('wifi=' + JSON.stringify(self.wifiConfig));
        
        confirm.open('Confirm installation?', 'Installation will erase all drive content. This operation cannot be reversed!<br/>Please note that admin permissions may be requested after file download.', 'Yes, install', 'No')
            .then(function() {
                //disable application quit
                $rootScope.$broadcast('disablequit');

                //prepare data
                self.flashing = true;
                var data = {
                    url: self.selectedIso.url,
                    drive: self.selectedDrive.path,
                    wifi: self.wifiConfig
                };
                logger.debug('Flash data:', data);

                //launch flash process
                cleepService.sendCommand('startflash', data)
                    .then(function() {
                        toast.info('Installation started');
                    }, function(err) {
                        //no toast here, if error occured with command, it should return an exception that is catched
                        //and toasted by cleepService
                        self.flashing = false;
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
                    cleepService.sendCommand('cancelflash')
                        .then(function() {
                            toast.info('Installation canceled');
                        });
                });
        }
        else if( self.status.status===self.STATUS.FLASHING || self.status.status===self.STATUS.VALIDATING )
        {
            confirm.open('Cancel installation?', 'Canceling installation during this step of process will put your removable media in inconsistant state.', 'Yes, cancel', 'No, continue')
                .then(function() {
                    cleepService.sendCommand('cancelflash')
                        .then(function() {
                            toast.info('Installation canceled');
                        });
                });
        }
        else if( self.status.status===self.STATUS.REQUEST_WRITE_PERMISSIONS )
        {
            //can cancel if permissions is blocked. Can happen if user take too much time filling password
            confirm.open('Cancel installation?', null, 'Yes', 'No')
                .then(function() {
                    cleepService.sendCommand('cancelflash')
                        .then(function() {
                            toast.info('Installation canceled');
                        });
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
        $rootScope.$broadcast('download-file', {url: self.selectedIso.url});
    };

    //flash update received
    $rootScope.$on('flash', function(_event, data) {
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

Cleep.controller('installController', ['$rootScope', 'cleepService', 'toastService', 'confirmService', 'logger', 'updateService', 
                                        'installService', 'modalService', installController]);


