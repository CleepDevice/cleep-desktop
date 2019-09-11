var Cleep = angular.module('Cleep')

/**
 * Devices controller
 */
var devicesController = function($state, devicesService)
{
    var self = this;
    self.devicesService = devicesService;

    //open device page
    self.openDevicePage = function(device)
    {
        if( !device ) {
            toast.error('Invalid device');
        }

        //select device
        devicesService.selectDevice(device);

        if( device.online ) {
            //prepare device url
            var url = device.ip + ':' + device.port;
            url = device.ssl ? 'https://' + url : 'http://' + url

            //open device page on right panel
            $state.go('device', {
                url,
                hostname: device.hostname
            });
        }
        else {
            toast.info('You can\'t connect to offline devices');
        }
    };

    //open install page
    self.openInstallPage = function()
    {
        $state.go('installAuto');
    };

};
Cleep.controller('devicesController', ['$state', 'devicesService', devicesController]);

