angular
.module('Cleep')
.controller('devicesController', ['$state', 'devicesService', 'toastService', 'confirmService', '$rootScope', 'loggerService', 'electronService',
function($state, devicesService, toastService, confirmService, $rootScope, logger, electron) {
    var self = this;
    self.devicesService = devicesService;

    self.goDevicePage = function(device, viaGateway) {
        $state.go('device', {
            url: device.url,
            hostname: device.hostname,
            auth: device.auth,
            deviceUuid: device.uuid,
            viaGateway: Boolean(viaGateway),
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
     * Open a device (LAN if online, else via house gateway public URL).
     */
    self.openDevicePage = function(device) {
        if (!device) {
            toastService.error('Invalid device');
            return;
        }

        var url = devicesService.resolveOpenUrl(device);
        if (!url) {
            toastService.info(device.online
                ? 'Unable to open device'
                : 'Device is offline and no remote gateway is available');
            return;
        }

        var viaGateway = !device.online;
        logger.debug('Open device page', { device: device, url: url, viaGateway: viaGateway });
        self._openDeviceAtUrl(device, url, viaGateway);
    };

    self._openDeviceAtUrl = function(device, url, viaGateway) {
        devicesService.selectDevice(device.uuid);

        var target = Object.assign({}, device, { url: url });

        if (!device.auth) {
            self.goDevicePage(target, viaGateway);
            return;
        }

        electron.devices.prepareAuth({
            url: url,
            deviceUuid: device.uuid,
        })
            .then((result) => {
                if (result && result.ready) {
                    device.hasAuthStored = true;
                    logger.debug('Device auth ready from session/vault, opening device');
                    self.goDevicePage(target, viaGateway);
                    return;
                }
                logger.debug('No stored device auth, showing login form');
                device.hasAuthStored = false;
                self.goDeviceAuthPage(target);
            })
            .catch((error) => {
                logger.warn('Unable to prepare device auth', error);
                if (error && error.code === 'VAULT_UNLOCK_CANCELLED') {
                    toastService.info('Vault unlock cancelled');
                    return;
                }
                self.goDeviceAuthPage(target);
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
        if (device.online || devicesService.isGatewayAccess(device)) {
            $rootScope.$emit('reload-device-page', device.hostname);
        }
    };

    self.canRefreshRemoteUrl = function(device) {
        return devicesService.canRefreshRemoteUrl(device);
    };

    /** Refresh is only meaningful on the gateway device that owns the tunnel. */
    self.showRefreshRemoteUrl = function(device) {
        return Boolean(devicesService.getPrimaryRemoteUrl(device));
    };

    self.refreshRemoteUrl = function(device) {
        if (!device || !self.canRefreshRemoteUrl(device)) {
            toastService.info('Remote URL refresh is not available for this device');
            return;
        }

        electron.devices.refreshRemoteUrl({ deviceUuid: device.uuid })
            .then((result) => {
                toastService.success('Remote URL updated');
                if (result && result.publicUrl) {
                    self._openDeviceAtUrl(device, result.publicUrl);
                }
            })
            .catch((error) => {
                logger.warn('Unable to refresh remote URL', error);
                toastService.error((error && error.message) || 'Unable to refresh remote URL');
            });
    };
}]);
