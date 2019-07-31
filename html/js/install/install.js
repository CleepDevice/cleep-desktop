var Cleep = angular.module('Cleep');
const { dialog } = require('electron').remote;
var path = require('electron').remote.require('path');

/**
 * Install controller
 */
var installController = function($rootScope, $scope, cleepService, $timeout, toast, confirm, $filter, logger, updateService, installService)
{
    var self = this;
    self.status = {
        percent: 0,
        total_percent: 0,
        status: 0,
        eta: ''
    };
    self.flashing = false;

    //drives variables
    self.drives = installService.drives;
    self.selectedDrive = null;

    //isos variables
    self.isos = [];
    self.__isos = installService.isos;
    self.selectedIso = null;
    self.localIso = {
        url: null,
        label: 'Select file'
    };

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

    //open manual install
    self.gotoManualInstall = function()
    {
        cleepUi.openPage('installManually');
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

    //get flashable drives
    self.refreshDrives = function()
    {
        return installService.refreshDrives();
    };

    self.__refreshIsos = function() {
        //copy locally iso from installService
        self.isos = [];
        for( var i=0; i<self.__isos.isos.length; i++ )
        {
            self.isos.push(self.__isos.isos[i]);
        }

        //append new item for local iso
        if( self.__isos.withlocaliso )
        {
            //select file entry
            self.isos.push({
                category: 'local',
                label: 'Select file',
                sha1: null,
                timestamp: 0,
                url: null,
                selector: true
            });

            //selected file entry
            var url = null;
            var label = '-- no file selected --';
            if( self.localIso.url ) {
                url = self.localIso.url;
                label = self.localIso.label;
            }
            self.isos.push({
                category: 'local',
                label: label,
                sha1: null,
                timestamp: 0,
                url: url,
                selector: false
            });
        }

        //append item id to allow easier selection
        var id = 0;
        for( id=0; id<self.isos.length; id++ )
        {
            self.isos[id].id = id;
        }
    };

    //get isos
    self.refreshIsos = function()
    {
        return $timeout(function() {
            if( self.__isos.isos.length===0 ) {
                //no isos loaded yet, get list
                installService.refreshIsos()
                    .then(function() {
                        self.__refreshIsos();
                    });
            } else {
                //simply refresh internal list of isos
                self.__refreshIsos();
            }
        }, 0);
    };

    //select local iso
    self.selectLocalIso = function(item)
    {
        if( !item.selector )
        {
            return;
        }

        var options = {
            title: 'Select local iso',
            filters: [
                {name: 'Iso file', extensions: ['zip', 'iso', 'img', 'dmg', 'raw']}
            ]
        };
        dialog.showOpenDialog(options, function(filenames) {
            if( filenames===undefined )
            {
                //no file selected
                self.selectedIso = null;
                return;
            }

            //save selected file infos
            self.localIso.url = 'file://' + filenames[0];
            self.localIso.label = path.parse(filenames[0]).base;
            selectedIso = null;
            for( var i=0; i<self.isos.length; i++ )
            {
                if( self.isos[i].category==='local' && self.isos[i].selector===false )
                {
                    self.isos[i].url = self.localIso.url;
                    self.isos[i].label = self.localIso.label;
                    selectedIso = self.isos[i];
                    break;
                }
            }

            //and select entry in md-select
            $timeout(function() {
                self.selectedIso = selectedIso;
            }, 250);

        }); 
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

    //initialize
    self.init = function()
    {
        //get flash status
        self.getStatus();
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

    //init controller
    self.init();

};

Cleep.controller('installController', ['$rootScope', '$scope', 'cleepService', '$timeout', 'toastService', 'confirmService', '$filter', 'logger', 
                                            'updateService', 'installService', installController]);


