angular
.module('Cleep')
.controller('devicesController', ['$state', 'devicesService', 'toastService', 'confirmService', '$rootScope', 'loggerService', 'electronService', 'contentTabsService',
function($state, devicesService, toastService, confirmService, $rootScope, logger, electron, contentTabs) {
    var self = this;
    self.devicesService = devicesService;

    self.canOpenDeviceInNewTab = function(device) {
        if (!device) {
            return false;
        }
        if (contentTabs.findTabByDeviceUuid(device.uuid)) {
            return true;
        }
        return contentTabs.canOpenNewTab();
    };

    self.openDeviceInNewTab = function(device) {
        self.openDevicePage(device, { newTab: true });
    };

    /** Middle-click → same as Open in new tab. */
    self.onDeviceMouseDown = function($event, device) {
        if (!$event || $event.button !== 1) {
            return;
        }
        $event.preventDefault();
        $event.stopPropagation();
        self.openDevicePage(device, { newTab: true });
    };

    self.goDeviceAuthPage = function(device, options) {
        options = options || {};
        $state.go('deviceAuth', {
            url: device.url,
            hostname: device.hostname,
            deviceUuid: device.uuid,
            newTab: Boolean(options.newTab),
            viaGateway: Boolean(options.viaGateway),
        });
    };

    /**
     * Open a device (LAN if online, else via house gateway public URL).
     * @param {object} device
     * @param {{ newTab?: boolean }} options
     */
    self.openDevicePage = function(device, options) {
        options = options || {};
        if (!device) {
            toastService.error('Invalid device');
            return;
        }

        var existing = contentTabs.findTabByDeviceUuid(device.uuid);
        if (existing) {
            contentTabs.activateTab(existing.id);
            return;
        }

        if (options.newTab && !contentTabs.canOpenNewTab()) {
            toastService.info('Maximum number of tabs reached');
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
        logger.debug('Open device page', { device: device, url: url, viaGateway: viaGateway, newTab: options.newTab });
        self._openDeviceAtUrl(device, url, viaGateway, options.newTab);
    };

    self._openDeviceAtUrl = function(device, url, viaGateway, newTab) {
        devicesService.selectDevice(device.uuid);

        var target = Object.assign({}, device, { url: url });

        if (!device.auth) {
            contentTabs.openDevice(target, url, { newTab: Boolean(newTab), viaGateway: Boolean(viaGateway) });
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
                    contentTabs.openDevice(target, url, { newTab: Boolean(newTab), viaGateway: Boolean(viaGateway) });
                    return;
                }
                logger.debug('No stored device auth, showing login form');
                device.hasAuthStored = false;
                self.goDeviceAuthPage(target, { newTab: newTab, viaGateway: viaGateway });
            })
            .catch((error) => {
                logger.warn('Unable to prepare device auth', error);
                if (error && error.code === 'VAULT_UNLOCK_CANCELLED') {
                    toastService.info('Vault unlock cancelled');
                    return;
                }
                self.goDeviceAuthPage(target, { newTab: newTab, viaGateway: viaGateway });
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
                            () => {
                                var tab = contentTabs.findTabByDeviceUuid(device.uuid);
                                if (tab && tab.closable) {
                                    contentTabs.closeTab(tab.id);
                                }
                                toastService.success('Device deleted successfully');
                            },
                            () => { toastService.error('Error occured deleting device'); }
                        );
                },
                () => { /* dialog canceled*/ },
            );
    };

    self.reloadDevicePage = function(device) {
        if (device.online || devicesService.isGatewayAccess(device)) {
            contentTabs.reloadSession(device.uuid);
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
                    var tab = contentTabs.findTabByDeviceUuid(device.uuid);
                    self._openDeviceAtUrl(device, result.publicUrl, false, Boolean(tab && tab.closable));
                }
            })
            .catch((error) => {
                logger.warn('Unable to refresh remote URL', error);
                toastService.error((error && error.message) || 'Unable to refresh remote URL');
            });
    };

    // Keep tab icons in sync with online/auth/developer flags.
    $rootScope.$on('devices-updated', function() {
        contentTabs.updateDeviceIcons();
    });
    $rootScope.$on('developer-device-changed', function() {
        contentTabs.updateDeviceIcons();
    });
}]);
