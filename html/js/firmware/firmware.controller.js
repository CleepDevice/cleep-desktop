angular
.module('Cleep')
.controller('firmwareController', ['$scope', '$stateParams', 'firmwareService', 'toastService',
                                   'modalService', 'electronService', 'loggerService', 'confirmService',
function($scope, $stateParams, firmwareService, toast, modalService, electron, logger, confirm) {
    var self = this;
    self.firmwares = [];
    self.selectedFirmware = null;
    self.selectedPico = null;
    self.permissionOk = true;
    self.permissionMessage = '';
    self.flashing = false;
    self.percent = 0;
    self.progressLabel = 'Idle';
    self.progressInfinite = false;
    self.resultType = '';
    self.resultMessage = '';
    self.mismatchWarnings = [];
    self.mismatchErrors = [];
    self._unsub = null;
    self._previewSeq = 0;

    self.firmwareSubtitle = function() {
        if (!self.selectedFirmware) {
            return 'No firmware selected';
        }
        var fw = self.selectedFirmware;
        var parts = [fw.name || fw.id];
        if (fw.firmware_version) {
            parts.push('v' + fw.firmware_version);
        }
        if (fw.app) {
            parts.push(fw.app);
        }
        return parts.join(' · ');
    };

    self.picoSubtitle = function() {
        if (!self.selectedPico) {
            return 'No Pico selected';
        }
        return self.selectedPico.title + ' - ' + (self.selectedPico.subtitle || '');
    };

    self.canFlash = function() {
        return Boolean(
            self.selectedFirmware
            && self.selectedPico
            && self.permissionOk
            && !self.flashing
            && self.selectedPico.accessible !== false
        );
    };

    self.refreshList = function() {
        return firmwareService.refreshList()
            .then(function(list) {
                self.firmwares = list || [];
                if (self.selectedFirmware) {
                    var still = self.firmwares.find(function(fw) {
                        return fw.hash === self.selectedFirmware.hash;
                    });
                    self.selectedFirmware = still || null;
                }
                return self.firmwares;
            });
    };

    self.checkPermissions = function() {
        return electron.firmware.checkPermissions()
            .then(function(status) {
                self.permissionOk = !status || status.ok !== false;
                self.permissionMessage = self.permissionOk ? '' : (status.message || 'Flash permissions are insufficient.');
            })
            .catch(function(error) {
                logger.warn('Permission check failed', error);
                self.permissionOk = true;
                self.permissionMessage = '';
            });
    };

    self.openFirmwarePicker = function() {
        return modalService.open(
            'firmwarePickerController',
            'js/firmware/firmware-picker-dialog.html'
        ).then(function(fw) {
            if (fw) {
                self.selectedFirmware = fw;
                self.clearResult();
                self.refreshMismatchNotes();
            }
        }).catch(angular.noop);
    };

    self.openPicoPicker = function() {
        return modalService.open(
            'picoPickerController',
            'js/firmware/pico-picker-dialog.html'
        ).then(function(target) {
            if (target) {
                self.selectedPico = target;
                self.clearResult();
                if (target.accessible === false) {
                    self.permissionOk = false;
                    self.permissionMessage = target.accessError || self.permissionMessage;
                    self.clearMismatchNotes();
                } else {
                    self.checkPermissions();
                    self.refreshMismatchNotes();
                }
            }
        }).catch(angular.noop);
    };

    self.clearResult = function() {
        self.resultType = '';
        self.resultMessage = '';
    };

    self.clearMismatchNotes = function() {
        self.mismatchWarnings = [];
        self.mismatchErrors = [];
    };

    self.refreshMismatchNotes = function() {
        self.clearMismatchNotes();
        if (!self.selectedFirmware || !self.selectedPico || self.selectedPico.kind !== 'bootsel') {
            return Promise.resolve();
        }

        var seq = ++self._previewSeq;
        var request = {
            hash: self.selectedFirmware.hash,
            targetId: self.selectedPico.id,
            mountPath: self.selectedPico.mountPath,
        };
        return electron.firmware.flashPreview(request)
            .then(function(preview) {
                if (seq !== self._previewSeq) {
                    return;
                }
                self.mismatchWarnings = (preview && preview.warnings) || [];
                self.mismatchErrors = (preview && preview.errors) || [];
            })
            .catch(function(error) {
                if (seq !== self._previewSeq) {
                    return;
                }
                logger.warn('Flash preview failed', error);
                self.clearMismatchNotes();
            });
    };

    self.showBootselGuide = function() {
        if (!self.flashing && self.resultType) {
            return false;
        }
        var label = String(self.progressLabel || '');
        return /bootsel/i.test(label) || /storage mode/i.test(label);
    };

    self.ensureFlashProgressListener = function() {
        if (self._unsub) {
            return;
        }
        self._unsub = electron.firmware.onFlashProgress(function(_event, progress) {
            if (!progress) {
                return;
            }
            self.percent = progress.percent || 0;
            self.progressInfinite = self.percent < 5 && progress.status === 'running';
            if (progress.current) {
                self.progressLabel = progress.current;
            }
            if (progress.status === 'error') {
                self.resultType = 'error';
                self.resultMessage = progress.error || progress.current || 'Flash failed';
                self.progressLabel = self.resultMessage;
                self.percent = 100;
                self.progressInfinite = false;
                self.flashing = false;
            }
            if (progress.status === 'success') {
                self.resultType = 'success';
                self.resultMessage = progress.current || 'Flash completed successfully.';
                self.progressLabel = self.resultMessage;
                self.percent = 100;
                self.progressInfinite = false;
                self.flashing = false;
            }
            if (!$scope.$$phase) {
                $scope.$applyAsync(angular.noop);
            }
        });
    };

    self.startFlash = function() {
        if (!self.canFlash()) {
            if (!self.selectedFirmware || !self.selectedPico) {
                toast.warning('Select a firmware and a Pico first');
            }
            return;
        }

        self.flashing = true;
        self.percent = 0;
        self.progressInfinite = true;
        self.progressLabel = 'Starting...';
        self.clearResult();
        electron.firmware.setBlocking(true).catch(angular.noop);
        self.ensureFlashProgressListener();

        var request = {
            hash: self.selectedFirmware.hash,
            targetId: self.selectedPico.id,
            autoPrepare: true,
        };
        if (self.selectedPico.kind === 'bootsel') {
            request.mountPath = self.selectedPico.mountPath;
        }
        if (self.selectedPico.kind === 'serial') {
            request.serialPath = self.selectedPico.serialPath;
        }

        electron.firmware.flash(request)
            .then(function() {
                self.resultType = 'success';
                self.resultMessage = self.progressLabel && self.progressLabel !== 'Starting...'
                    ? self.progressLabel
                    : 'Flash completed successfully.';
                self.progressLabel = self.resultMessage;
                self.percent = 100;
                self.progressInfinite = false;
                toast.success('Pico flashed');
            })
            .catch(function(error) {
                logger.error('Flash failed', error);
                var message = (error && error.message) || 'Flash failed';
                self.resultType = 'error';
                self.resultMessage = message;
                self.progressLabel = message;
                self.percent = 100;
                self.progressInfinite = false;
                toast.error(message);
            })
            .finally(function() {
                self.flashing = false;
                electron.firmware.setBlocking(false).catch(angular.noop);
            });
    };

    self.startErase = function() {
        if (self.flashing) {
            return;
        }

        confirm.open(
            'Erase Pico flash',
            'This will <strong>wipe all flash content</strong> on the Pico (firmware and files). '
                + 'The board must be in storage mode (BOOTSEL). Continue?',
            'Erase',
            'Cancel'
        ).then(function() {
            self.flashing = true;
            self.percent = 0;
            self.progressInfinite = true;
            self.progressLabel = 'Preparing erase...';
            self.clearResult();
            electron.firmware.setBlocking(true).catch(angular.noop);
            self.ensureFlashProgressListener();

            var request = {};
            if (self.selectedPico && self.selectedPico.kind === 'bootsel') {
                request.targetId = self.selectedPico.id;
                request.mountPath = self.selectedPico.mountPath;
            }

            return electron.firmware.erase(request);
        }).then(function() {
            self.resultType = 'success';
            self.resultMessage = self.progressLabel && self.progressLabel.indexOf('Preparing') !== 0
                ? self.progressLabel
                : 'Flash erased. The Pico should return to storage mode.';
            self.progressLabel = self.resultMessage;
            self.percent = 100;
            self.progressInfinite = false;
            toast.success('Pico flash erased');
        }).catch(function(error) {
            // Dialog cancel resolves as undefined / falsey
            if (!error) {
                return;
            }
            logger.error('Erase failed', error);
            var message = (error && error.message) || 'Erase failed';
            self.resultType = 'error';
            self.resultMessage = message;
            self.progressLabel = message;
            self.percent = 100;
            self.progressInfinite = false;
            toast.error(message);
        }).finally(function() {
            self.flashing = false;
            electron.firmware.setBlocking(false).catch(angular.noop);
        });
    };

    var unsubCache = $scope.$on('firmware-cache-changed', function(_event, list) {
        self.firmwares = list || [];
    });

    $scope.$on('$destroy', function() {
        unsubCache();
        if (typeof self._unsub === 'function') {
            self._unsub();
            self._unsub = null;
        }
        electron.firmware.setBlocking(false).catch(angular.noop);
    });

    self.checkPermissions();
    self.refreshList().then(function() {
        var hash = $stateParams.selectedHash;
        if (hash) {
            var match = self.firmwares.find(function(fw) {
                return fw.hash === hash || fw.hash === 'sha256:' + hash || ('sha256:' + fw.hash) === hash;
            });
            if (match) {
                self.selectedFirmware = match;
            }
        }
    });
}]);
