/**
 * Devices controller
 */
angular
.module('Cleep')
.controller('devicesController', ['$state', 'devicesService', 'toastService', 'confirmService', '$rootScope', 'downloadService',
function($state, devicesService, toastService, confirmService, $rootScope, downloadService) {
    var self = this;
    self.devicesService = devicesService;

    // open device page
    self.openDevicePage = function(device) {
        if( !device ) {
            toastService.error('Invalid device');
        }

        if( device.online ) {
            // prepare device url
            var url = device.ip + ':' + device.port;
            url = device.ssl ? 'https://' + url : 'http://' + url

            // open device page on right panel
            $state.go('device', {
                url,
                hostname: device.hostname
            });

            // select device
            devicesService.selectDevice(device);
        } else {
            toastService.info('You can\'t connect to offline devices');
        }
    };

    // open device menu
    self.openDeviceMenu = function($mdMenu, ev) {
        $mdMenu.open(ev);
    };

    // open install page
    self.openInstallPage = function() {
        $state.go('installAuto');
    };

    self.download = function() {
        downloadService.downloadUrl('https://github.com/tangb/cleep-os/releases/download/v0.0.29/cleepos_0.0.29.zip');
    }

    // delete device
    self.deleteDevice = function(device) {
        confirmService.open('Confirm device deletion ?', 'Device will only be removed from list.<br>This is useful to delete obsolete entries.')
            .then(() => {
                return devicesService.deleteDevice(device);
            })
            .then(() => {
                toastService.success('Device deleted');
            });
    }

    // reload device page
    self.reloadDevicePage = function(device) {
        if( device.online ) {
            $rootScope.$emit('reloaddevicepage', device.hostname);
        }
    }

}]);
