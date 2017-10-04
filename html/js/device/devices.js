var Cleep = angular.module('Cleep')

/**
 * Devices controller
 */
var devicesController = function($rootScope, $scope, $timeout, cleepService, $state)
{
    var self = this;
    self.devices = [];
    self.unconfigured = 0;
    self.configured = 0;
    self.loading = true;

    //synchronize devices
    self.syncDevices = function(devices)
    {
        if( devices )
        {
            var found = false;
            for( var i=0; i<devices.length; i++ )
            {
                found = false;
                for( var j=0; j<self.devices.length; j++ )
                {
                    if( self.devices[j].uuid===devices[i].uuid )
                    {
                        //device found
                        found = true;

                        //update device infos
                        self.devices[j].hostname = devices[i].hostname;
                        self.devices[j].ip = devices[i].ip;
                        self.devices[j].port = devices[i].port;
                        self.devices[j].online = devices[i].online;

                        break;
                    }
                }

                //add new device
                if( !found )
                {
                    //set device configured flag
                    if( devices[i].hostname.length>0 )
                        devices[i].configured = true;
                    else
                        devices[i].configured = false;

                    //save entry
                    self.devices.push(devices[i]);
                }
            }
        }
    };

    //get devices
    /*self.getDevices = function()
    {
        rpcService.getDevices()
            .then(function(resp) {
                if( resp && !resp.error )
                {
                    self.loading = false;

                    self.syncDevices(resp.data.devices);
                    self.unconfigured = resp.data.unconfigured;
                    self.configured = self.devices.length - self.unconfigured;
                }
            });
    };*/

    //watch for devices
    /*self.watchDevices = function()
    {
        $timeout(function() {
            self.getDevices();
        }, 1000)
            .then(function() {
                self.watchDevices();
            });
    };*/

    //open device page
    self.openDevicePage = function(device)
    {
        if( device )
        {
            //prepare device url
            var url = device.ip + ':' + device.port;
            if( device.ssl )
                url = 'https://' + url;
            else
                url = 'http://' + url;

            //open device page on right panel
            $state.go('device', {url:url});
        }
    };

    //init controller
    //self.watchDevices();
    
    self.updateDevices = function(data) 
    {
        $timeout(function() {
            self.syncDevices(data.devices);
            self.unconfigured = data.unconfigured;
            self.configured = self.devices.length - self.unconfigured;
            self.loading = false;
        }, 0);
    };

    self.openDevice = function()
    {
        //leftPanel.attr('src', self.src);

        cleepService.send('coucou', {});
    };

    //start devices websocket
    //rpcService.devicesWebSocket(self.updateDevices);
    
    $rootScope.$on('devices', function(event, data)
    {
        self.updateDevices(data);
    });
};
Cleep.controller('devicesController', ['$rootScope', '$scope', '$timeout', 'cleepService', '$state', devicesController]);

