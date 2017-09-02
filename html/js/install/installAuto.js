var Cleep = angular.module('Cleep');

/**
 * Auto install controller
 */
var autoInstallController = function($rootScope, $scope, cleepService, $timeout, toast, confirm, $filter)
{
    var self = this;
    self.status = {
        percent: 0,
        total_percent: 0,
        status: 0,
        eta: ''
    };
    self.flashing = false;
    self.drives = [];
    self.selectedDrive = null;
    self.isos = [];
    self.selectedIso = null;
    self.noCleepIso = true;
    self.noRaspbianIso = true;
    self.noDrive = true;

    //return current flash status
    self.getStatus = function(init)
    {
        return cleepService.sendCommand('getflashstatus')
            .then(function(resp) {
                self.status = resp.data;
            });
    };

    //get flashable drives
    self.refreshDrives = function()
    {
        return cleepService.sendCommand('getflashdrives')
            .then(function(resp) {
                self.drives = resp.data;
                self.noDrive = self.drives.length===0;
            });
    };

    //get isos
    self.refreshIsos = function()
    {
        return cleepService.sendCommand('getisos')
            .then(function(resp) {
                self.isos = resp.data.isos;
                self.noCleepIso = resp.data.cleepIsos===0;
                self.noRaspbianIso = resp.data.raspbianIsos===0;
                self.raspbian = resp.data.raspbian;
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
        
        confirm.open('Confirm installation?', 'Installation will erase all drive content. This operation cannot be reversed!<br/>Please note that admin permissions may be requested after file download.', 'Yes, install', 'No')
            .then(function() {
                self.flashing = true;
                var data = {
                    url: self.selectedIso,
                    drive: self.selectedDrive
                };
                cleepService.sendCommand('startflash', data)
                    .then(function() {
                        toast.info('Installation started')
                    });
            });
    };

    //cancel flash process
    self.cancelFlash = function()
    {
        //check if process is running
        if( self.status && self.status.status>=5 )
        {
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
            confirm.open('Cancel installation?', 'Canceling installation during this step of process makes your removable media unusable until next installation.', 'Yes, cancel', 'No, continue')
                .then(function() {
                    cleepService.sendCommand('cancelflash')
                        .then(function() {
                            toast.info('Installation canceled');
                        });
                });
        }
    };

    //flash update recevied
    $rootScope.$on('flash', function(event, data) {
        self.status = data;

        //enable flash button
        if( self.status.status==0 || self.status.status>=5 )
        {
            self.flashing = false;
        }
        else
        {
            self.flashing = true;
        }
    });

    //init controller
    self.getStatus();

};

Cleep.controller('autoInstallController', ['$rootScope', '$scope', 'cleepService', '$timeout', 'toastService', 'confirmService', '$filter', autoInstallController]);


