angular
.module('Cleep')
.controller('deviceErrorController', ['$stateParams', '$state', 'devicesService', 'electronService', 'toastService', 'loggerService',
function($stateParams, $state, devicesService, electron, toastService, logger) {
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
                $state.go('device', {
                    url: publicUrl,
                    hostname: device.hostname,
                    auth: device.auth,
                    deviceUuid: device.uuid,
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
