angular
.module('Cleep')
.controller('deviceErrorController', ['$stateParams', '$state', 'devicesService', 'electronService', 'toastService', 'loggerService', 'contentTabsService',
function($stateParams, $state, devicesService, electron, toastService, logger, contentTabs) {
    var self = this;
    self.hostname = $stateParams.hostname || 'unknown';
    self.deviceUuid = $stateParams.deviceUuid || null;
    self.url = $stateParams.url || null;
    self.refreshing = false;

    self.getDevice = function() {
        if (!self.deviceUuid) {
            return null;
        }
        return devicesService.findDevice(self.deviceUuid) || null;
    };

    self.canRefresh = function() {
        return devicesService.canRefreshRemoteUrl(self.getDevice());
    };

    self.retryConnection = function() {
        if (!self.deviceUuid) {
            return;
        }
        var tab = contentTabs.findTabByDeviceUuid(self.deviceUuid);
        contentTabs.retrySession(self.deviceUuid);
        // Leave the legacy deviceError ui-view without retitling/stealing focus.
        if (tab && tab.closable) {
            var pageState = contentTabs.getMainPageState();
            if (pageState && pageState !== 'deviceError' && pageState !== 'deviceAuth' && pageState !== 'device') {
                $state.go(pageState);
            } else {
                $state.go('default');
            }
            contentTabs.activateTab(tab.id);
            return;
        }
        var session = contentTabs.getSession(self.deviceUuid);
        $state.go('device', {
            url: (session && session.url) || self.url,
            hostname: (session && session.hostname) || self.hostname,
            deviceUuid: self.deviceUuid,
            viaGateway: Boolean(session && session.viaGateway),
        });
    };

    self.refreshRemoteUrl = function() {
        var device = self.getDevice();
        if (!device || !self.canRefresh() || self.refreshing) {
            return;
        }

        self.refreshing = true;
        electron.devices.refreshRemoteUrl({ deviceUuid: device.uuid })
            .then((result) => {
                toastService.success('Remote URL updated');
                var publicUrl = result && result.publicUrl;
                if (!publicUrl) {
                    return;
                }
                var tab = contentTabs.findTabByDeviceUuid(device.uuid);
                contentTabs.openDevice(device, publicUrl, {
                    newTab: Boolean(tab && tab.closable),
                    viaGateway: false,
                });
                contentTabs.retrySession(device.uuid);
                if (tab && tab.closable) {
                    var pageState = contentTabs.getMainPageState();
                    if (pageState && pageState !== 'deviceError' && pageState !== 'deviceAuth' && pageState !== 'device') {
                        $state.go(pageState);
                    } else {
                        $state.go('default');
                    }
                    contentTabs.activateTab(tab.id);
                } else {
                    $state.go('device', {
                        url: publicUrl,
                        hostname: device.hostname,
                        deviceUuid: device.uuid,
                        viaGateway: false,
                    });
                }
            })
            .catch((error) => {
                logger.warn('Unable to refresh remote URL from error page', error);
                toastService.error((error && error.message) || 'Unable to refresh remote URL');
            })
            .finally(() => {
                self.refreshing = false;
            });
    };
}]);
