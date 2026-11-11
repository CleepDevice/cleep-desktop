angular
.module('Cleep')
.controller('firmwareDownloadController', ['loggerService', 'electronService', 'closeModal', 'modalData',
                                           'toastService', '$scope',
function(logger, electron, closeModal, modalData, toast, $scope) {
    var self = this;
    self.hostname = modalData.hostname || '';
    self.module = modalData.module || '';
    self.baseUrl = modalData.baseUrl;
    self.deviceUuid = modalData.deviceUuid;
    self.firmwares = (modalData.firmwares || []).map(function(fw) {
        return Object.assign({}, fw, {
            targets: Array.isArray(fw.targets) ? fw.targets : [],
        });
    });
    self.selectedHash = self.firmwares.length === 1 ? self.firmwares[0].hash : null;
    self.phase = 'download'; // download | error | ready
    self.percent = 0;
    self.progressLabel = 'Preparing download...';
    self.errorMessage = '';
    self.busy = false;
    self._unsub = null;

    self._attachProgress = function() {
        if (self._unsub) {
            return;
        }
        self._unsub = electron.firmware.onDownloadProgress(function(_event, progress) {
            if (!progress) {
                return;
            }
            self.percent = progress.percent || 0;
            if (progress.current) {
                self.progressLabel = 'Downloading ' + progress.current;
            }
            if (progress.status === 'error') {
                self.phase = 'error';
                self.errorMessage = progress.error || 'Download failed';
                self.busy = false;
            }
            if (progress.status === 'success') {
                self.phase = 'ready';
                self.percent = 100;
                self.progressLabel = 'Download complete';
                self.busy = false;
                if (!self.selectedHash && self.firmwares.length) {
                    self.selectedHash = self.firmwares[0].hash;
                }
            }
            if (!$scope.$$phase) {
                $scope.$applyAsync(angular.noop);
            }
        });
    };

    self.startDownload = function() {
        self.phase = 'download';
        self.busy = true;
        self.percent = 0;
        self.errorMessage = '';
        self.progressLabel = 'Downloading firmwares...';
        self._attachProgress();

        return electron.firmware.download({
            deviceUuid: self.deviceUuid,
            module: self.module,
            baseUrl: self.baseUrl,
            firmwares: self.firmwares,
        }).then(function() {
            self.phase = 'ready';
            self.percent = 100;
            self.busy = false;
            if (!self.selectedHash && self.firmwares.length) {
                self.selectedHash = self.firmwares[0].hash;
            }
        }).catch(function(error) {
            logger.error('Firmware download failed', error);
            self.phase = 'error';
            self.busy = false;
            self.errorMessage = (error && error.message) || 'Download failed';
            toast.error(self.errorMessage);
        });
    };

    self.retry = function() {
        self.startDownload();
    };

    self.cancel = function() {
        closeModal({ action: 'cancel' });
    };

    self.flash = function() {
        if (!self.selectedHash) {
            toast.warning('Select a firmware to flash');
            return;
        }
        closeModal({ action: 'flash', hash: self.selectedHash });
    };

    $scope.$on('$destroy', function() {
        if (typeof self._unsub === 'function') {
            self._unsub();
            self._unsub = null;
        }
    });

    self.startDownload();
}]);
