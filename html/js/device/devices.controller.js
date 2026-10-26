angular
.module('Cleep')
.controller('devicesController', ['$state', 'devicesService', 'toastService', 'confirmService', '$rootScope', 'loggerService', 'electronService',
function($state, devicesService, toastService, confirmService, $rootScope, logger, electron) {
    var self = this;
    self.devicesService = devicesService;

    self.goDevicePage = function(device) {
        $state.go('device', {
            url: device.url,
            hostname: device.hostname,
            auth: device.auth,
            deviceUuid: device.uuid,
        });
    };

    self.goDeviceAuthPage = function(device) {
        $state.go('deviceAuth', {
            url: device.url,
            hostname: device.hostname,
            deviceUuid: device.uuid,
        });
    };

    /**
     * Open a device:
     * - no auth → device page
     * - credentials in session/vault → unlock vault if needed, then device page (no login form)
     * - otherwise → login form
     *
     * Always asks main via prepareAuth (does not trust hasAuthStored alone: peer updates used to wipe it).
     */
    self.openDevicePage = function(device) {
        if (!device) {
            toastService.error('Invalid device');
            return;
        }

        if (!device.online) {
            toastService.info('You can\'t connect to offline device');
            return;
        }

        logger.debug('Open device page', device);
        devicesService.selectDevice(device.uuid);

        if (!device.auth) {
            self.goDevicePage(device);
            return;
        }

        electron.devices.prepareAuth({
            url: device.url,
            deviceUuid: device.uuid,
        })
            .then((result) => {
                if (result && result.ready) {
                    device.hasAuthStored = true;
                    logger.debug('Device auth ready from session/vault, opening device');
                    self.goDevicePage(device);
                    return;
                }
                logger.debug('No stored device auth, showing login form');
                device.hasAuthStored = false;
                self.goDeviceAuthPage(device);
            })
            .catch((error) => {
                logger.warn('Unable to prepare device auth', error);
                if (error && error.code === 'VAULT_UNLOCK_CANCELLED') {
                    toastService.info('Vault unlock cancelled');
                    return;
                }
                self.goDeviceAuthPage(device);
            });
    };

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
    };

    self.reloadDevicePage = function(device) {
        if (device.online) {
            $rootScope.$emit('reload-device-page', device.hostname);
        }
    };
}]);
