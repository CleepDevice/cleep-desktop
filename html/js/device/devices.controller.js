angular
.module('Cleep')
.controller('devicesController', ['$state', 'devicesService', 'toastService', 'confirmService', '$rootScope',
function($state, devicesService, toastService, confirmService, $rootScope) {
    var self = this;
    self.devicesService = devicesService;

    self.openDevicePage = function(device) {
        if (!device) {
            toastService.error('Invalid device');
        }

        if (device.online) {
            var url = self.__getDeviceUrl(device);
            $state.go('device', { url, hostname: device.hostname });
            devicesService.selectDevice(device.uuid);
        } else {
            toastService.info('You can\'t connect to offline device');
        }
    };

    self.__getDeviceUrl = function(device) {
        var url = device.ip + ':' + device.port;
        return (device.ssl ? 'https://' : 'http://') + url;
    }

    self.openDeviceMenu = function($mdMenu, ev) {
        $mdMenu.open(ev);
    };

    self.openInstallPage = function() {
        $state.go('installAuto');
    };

    self.deleteDevice = function(device) {
        confirmService.open('Confirm device deletion ?', 'Device will only be removed from list.<br>This is useful to delete obsolete entries.')
            .then(
                () => {
                    devicesService.deleteDevice(device)
                        .then(
                            () => { toastService.success('Device deleted successfully'); },
                            () => { toastService.error('Error occured deleting device'); }
                        );
                },
                () => { /* dialog canceled*/ },
            );
    }

    self.reloadDevicePage = function(device) {
        if (device.online) {
            $rootScope.$emit('reload-device-page', device.hostname);
        }
    }
}]);
