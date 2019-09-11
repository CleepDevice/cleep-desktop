/**
 * Devices service handles all devices
 */
var devicesService = function($rootScope, $timeout)
{
    var self = this;
    self.loading = true;
    self.devices = [];
    self.unconfigured = 0;
    self.configured = 0;

    //synchronize devices updating existing devices and adding new ones to avoir ui flickering
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
                        self.devices[j].configured = devices[i].configured;
                        self.devices[j].hostname = devices[i].hostname;
                        self.devices[j].ip = devices[i].ip;
                        self.devices[j].online = devices[i].online;
                        self.devices[j].port = devices[i].port;
                        self.devices[j].ssl = devices[i].ssl;
                        self.devices[j].version = devices[i].version;
                        self.devices[j].selected = false;

                        break;
                    }
                }

                //add new device
                if( !found )
                {
                    //save entry
                    self.devices.push(devices[i]);
                }
            }
        }
    };

    //select device in devices panel
    self.selectDevice = function(selectedDevice) {
        for( var i=0; i<self.devices.length; i++ )
        {
            if( selectedDevice && self.devices[i].ip===selectedDevice.ip )
            {
                self.devices[i].selected = true;
            }
            else
            {
                self.devices[i].selected = false;
            }
        }
    }

    //update devices list
    self.updateDevices = function(data) 
    {
        $timeout(function() {
            //sync devices
            self.syncDevices(data.devices);

            //update some controller members value
            self.unconfigured = data.unconfigured;
            self.configured = self.devices.length - self.unconfigured;
            self.loading = false;
        }, 0);
    };

    //watch for devices event to refresh devices list
    $rootScope.$on('devices', function(event, data)
    {
        self.updateDevices(data);
    });
}

var Cleep = angular.module('Cleep');
Cleep.service('devicesService', ['$rootScope', '$timeout', devicesService]);
