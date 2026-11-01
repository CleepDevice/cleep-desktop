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
        var session = contentTabs.getSession(self.deviceUuid);
        if (!session) {
            return;
        }
        contentTabs.setSessionError(self.deviceUuid, false);
        $state.go('device', {
            url: session.url,
            hostname: session.hostname,
            deviceUuid: session.deviceUuid,
            viaGateway: session.viaGateway,
        });
        contentTabs.reloadSession(self.deviceUuid);
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
