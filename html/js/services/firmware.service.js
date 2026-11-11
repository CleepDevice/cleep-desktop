/**
 * Pico firmware cache + install event handling (Phase C).
 * Listens for update.module.firmware, opens blocking download dialog for unknown hashes.
 */
angular
.module('Cleep')
.service('firmwareService', ['electronService', 'loggerService', 'modalService', 'devicesService',
                             'toastService', 'ipcLifecycle', '$rootScope',
function(electron, logger, modalService, devicesService, toast, ipcLifecycle, $rootScope) {
    var self = this;
    self.firmwares = [];
    self.hasCached = false;
    self._dialogOpen = false;
    self._progressUnsub = null;

    self.addIpcs = function() {
        self._unsubscribers.push(
            electron.devices.onMessage(self.onDevicesMessage.bind(self)),
        );
    };

    ipcLifecycle.attach(self, self.addIpcs, function() {
        self.refreshList();
    });

    self.refreshList = function() {
        return electron.firmware.list()
            .then(function(list) {
                self.firmwares = list || [];
                self.hasCached = self.firmwares.length > 0;
                $rootScope.$emit('firmware-cache-changed', self.firmwares);
                return self.firmwares;
            })
            .catch(function(error) {
                logger.warn('Unable to list firmwares', error);
                return [];
            });
    };

    self.deleteFirmware = function(hash) {
        return electron.firmware.delete(hash)
            .then(function() {
                return self.refreshList();
            });
    };

    self.onDevicesMessage = function(_event, payload) {
        var message = payload && payload.message;
        if (!message || message.event !== 'update.module.firmware') {
            return;
        }
        var params = message.params || {};
        var firmwares = Array.isArray(params.firmwares) ? params.firmwares : [];
        if (!firmwares.length) {
            return;
        }

        var peer = payload.peerInfos || {};
        var deviceUuid = peer.uuid;
        if (!deviceUuid) {
            logger.warn('Firmware event without device uuid', payload);
            return;
        }

        var hashes = firmwares.map(function(fw) { return fw.hash; });
        electron.firmware.unknown(hashes)
            .then(function(unknown) {
                if (!unknown || !unknown.length) {
                    logger.debug('All firmwares already cached, skip popup', { hashes: hashes });
                    return self.refreshList();
                }
                return self.openDownloadDialog({
                    deviceUuid: deviceUuid,
                    module: params.module || '',
                    peer: peer,
                    firmwares: firmwares,
                });
            })
            .catch(function(error) {
                logger.error('Unable to handle firmware event', error);
            });
    };

    self.buildBaseUrl = function(peer) {
        if (!peer) {
            return null;
        }
        var device = devicesService.findDevice(peer.uuid, peer.ip) || peer;
        var ssl = Boolean(device.ssl);
        var ip = device.ip || peer.ip;
        var port = device.port || peer.port || (ssl ? 443 : 80);
        if (!ip) {
            return null;
        }
        return (ssl ? 'https://' : 'http://') + ip + ':' + port;
    };

    self.openDownloadDialog = function(data) {
        if (self._dialogOpen) {
            logger.debug('Firmware dialog already open');
            return Promise.resolve(null);
        }
        var baseUrl = self.buildBaseUrl(data.peer);
        if (!baseUrl) {
            toast.error('Unable to reach device for firmware download');
            return Promise.resolve(null);
        }

        self._dialogOpen = true;
        electron.firmware.setBlocking(true).catch(angular.noop);

        return modalService.open(
            'firmwareDownloadController',
            'js/firmware/firmware-download-dialog.html',
            {
                deviceUuid: data.deviceUuid,
                module: data.module,
                baseUrl: baseUrl,
                firmwares: data.firmwares,
                hostname: (data.peer && (data.peer.hostname || data.peer.ip)) || data.deviceUuid,
            },
            null,
            { blocking: true }
        ).then(function(result) {
            return self.refreshList().then(function() {
                if (result && result.action === 'flash') {
                    $rootScope.$broadcast('open-page', {
                        page: 'flashPico',
                        selectedHash: result.hash || null,
                    });
                }
                return result;
            });
        }).catch(angular.noop)
        .finally(function() {
            self._dialogOpen = false;
            electron.firmware.setBlocking(false).catch(angular.noop);
        });
    };

    /** @deprecated Flash now runs inline on the Flash Pico page. */
    self.openFlashWizard = function(firmwareOrHash) {
        var hash = typeof firmwareOrHash === 'string'
            ? firmwareOrHash
            : (firmwareOrHash && firmwareOrHash.hash);
        $rootScope.$broadcast('open-page', {
            page: 'flashPico',
            selectedHash: hash || null,
        });
        return Promise.resolve(null);
    };
}]);
