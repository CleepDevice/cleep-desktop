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

    //wifi variables
    self.selectedWifiChoice = 0;
    self.wifi = installService.wifi;
    self.selectedWifiNetwork = {
        network: null,
        interface: null,
        encryption: null,
        signallevel: 0
    };
    self.wifiPassword = null;
    self.wifiNetworkName = '';
    self.wifiNetworkEncryption = 'wpa2';
    self.showPassword = false;

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

    //reset form fields
    self.resetFields = function()
    {
        logger.info('Reset fields');
        self.selectedDrive = null;
        self.selectedIso = null;
        self.selectedWifiNetwork = {
            network: null,
            interface: null,
            encryption: null,
            signallevel: 0
        };
        self.wifiPassword = null;
        self.wifiNetworkName = '';
        self.wifiNetworkEncryption = 'wpa2';
        self.showPassword = false;
        self.selectedWifiChoice = 0;
    };

    //return current flash status
    self.getStatus = function(init)
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

    //get wifi networks
    self.refreshWifiNetworks = function()
    {
        return installService.refreshWifiNetworks();
    };

    //start flash process
    self.startFlash = function()
    {
        //check values
        if( !self.selectedIso || !self.selectedDrive )
        {
            toast.error('Please select a Cleep version and a drive');
            return;
        }
        if( self.selectedWifiChoice==1 )
        {
            //user wants to connect to available wifi network
            if( !self.wifi.adapter && !self.wifiNetworkName )
            {
                toast.error('Please set wifi network name');
                return;
            }
            else if( self.wifi.adapter && !self.selectedWifiNetwork.network )
            {
                toast.error('Please select wifi network');
                return;
            }
            else if( self.wifiNetworkEncryption!='unsecured' && !self.wifiPassword )
            {
                toast.error('Please fill wifi network password');
                return;
            }
        }
        if( self.selectedWifiChoice==2 ) 
        {
            //user wants to connect to hidden network
            if( !self.wifiNetworkName )
            {
                toast.error('Please set wifi network name');
                return;
            }
            else if( self.wifiNetworkEncryption!='unsecured' && !self.wifiPassword )
            {
                toast.error('Please fill wifi network password');
                return;
            }
        }

        //wifi config
        wifiConfig = {
            network: null,
            encryption: null,
            password: null,
            hidden: (self.selectedWifiChoice==2 ? true : false)
        }
        if( self.selectedWifiChoice==1 )
        {
            //connect to available network (non hidden)
            if( !self.wifi.adapter && self.wifiNetworkName && self.wifiNetworkEncryption )
            {
                //fill wifi config from manual values
                wifiConfig.network = self.wifiNetworkName;
                wifiConfig.encryption = self.wifiNetworkEncryption;
                wifiConfig.password = self.wifiPassword;
            }
            else if( self.wifi.adapter && self.selectedWifiNetwork.network )
            {
                //fill wifi config from automatic values
                wifiConfig.network = self.selectedWifiNetwork.network;
                wifiConfig.encryption = self.selectedWifiNetwork.encryption;
                wifiConfig.password = self.wifiPassword;
            }
        }
        else if( self.selectedWifiChoice==2 )
        {
            //connect to hidden network (use manual values)
            wifiConfig.network = self.wifiNetworkName;
            wifiConfig.encryption = self.wifiNetworkEncryption;
            wifiConfig.password = self.wifiPassword;
        }
        logger.debug('url=' + self.selectedIso.url);
        logger.debug('drive=' + self.selectedDrive);
        logger.debug('wifi=' + JSON.stringify(wifiConfig));
        
        confirm.open('Confirm installation?', 'Installation will erase all drive content. This operation cannot be reversed!<br/>Please note that admin permissions may be requested after file download.', 'Yes, install', 'No')
            .then(function() {
                //disable application quit
                $rootScope.$broadcast('disablequit');

                //hide password
                self.showPassword = false;

                //prepare data
                self.flashing = true;
                var data = {
                    url: self.selectedIso.url,
                    drive: self.selectedDrive,
                    wifi: wifiConfig
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
        //check if process is running
        if( self.status && self.status.status>=6 )
        {
            self.logger.debug('CancelFlash: invalid status (' + self.status.status + ') do nothing');
            return;
        }

        if( self.status && (self.status.status===1 || self.status.status===2) )
        {
            confirm.open('Cancel installation?', null, 'Yes', 'No')
                .then(function() {
                    cleepService.sendCommand('cancelflash')
                        .then(function() {
                            toast.info('Installation canceled');
                        });
                });
        }
        else if( self.status && (self.status.status===3 || self.status.status===4) )
        {
            confirm.open('Cancel installation?', 'Canceling installation during this step of process will put your removable media in inconsistant state.', 'Yes, cancel', 'No, continue')
                .then(function() {
                    cleepService.sendCommand('cancelflash')
                        .then(function() {
                            toast.info('Installation canceled');
                        });
                });
        }
        else
        {
            logger.debug('Nothing to do with status (' + self.status.status + ')'); 
        }
    };

    //download iso file
    self.downloadIso = function()
    {
        $rootScope.$broadcast('download-file', {url: self.selectedIso.url});
    };

    //flash update recevied
    $rootScope.$on('flash', function(event, data) {
        if( !data )
            return;

        //save status
        var flashing = self.flashing;
        self.status = data;

        //enable/disable flash button
        if( self.status.status==0 || self.status.status>=6 )
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
            //suppress warning dialog
            $rootScope.$broadcast('enablequit');

            //clear form fields
            self.resetFields();
        }


        //force angular refresh
        $rootScope.$apply();
        $rootScope.$digest();

    });

};

Cleep.controller('installController', ['$rootScope', 'cleepService', 'toastService', 'confirmService', 'logger', 'updateService', 
                                        'installService', 'modalService', installController]);


