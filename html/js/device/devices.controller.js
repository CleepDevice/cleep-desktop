angular
.module('Cleep')
.controller('devicesController', ['$state', 'devicesService', 'toastService', 'confirmService', '$rootScope', 'electronService',
function($state, devicesService, toastService, confirmService, $rootScope, electron) {

    var self = this;
    self.devicesService = devicesService;

    self.openDevicePage = function(device) {
        if (!device) {
            toastService.error('Invalid device');
        }

        if (device.online) {
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

    self.openDeviceMenu = function($mdMenu, ev) {
        $mdMenu.open(ev);
    };

    self.openInstallPage = function() {
        $state.go('installAuto');
    };

    // TODO remove
    self.test = function() {
        electron.sendReturn('cache-get-files')
            .then((resp) => {
                console.log('======>', resp);
            });
    }

    self.deleteDevice = function(device) {
        confirmService.open('Confirm device deletion ?', 'Device will only be removed from list.<br>This is useful to delete obsolete entries.')
            .then(() => {
                return devicesService.deleteDevice(device);
            })
            .then(() => {
                toastService.success('Device deleted');
            });
    }

    self.reloadDevicePage = function(device) {
        if (device.online) {
            $rootScope.$emit('reload-device-page', device.hostname);
        }
    }

}]);
