angular
.module('Cleep')
.controller('picoPickerController', ['closeModal', 'electronService', 'loggerService',
                                     'toastService', '$interval', '$scope',
function(closeModal, electron, logger, toast, $interval, $scope) {
    var self = this;
    self.closeModal = closeModal;
    self.targets = [];
    self.loading = true;
    self.initialScanDone = false;
    self.accessHint = '';
    self._poll = null;

    self.refresh = function(options) {
        var silent = options && options.silent;
        if (!silent) {
            self.loading = true;
        }
        return electron.firmware.scanTargets()
            .then(function(targets) {
                self.targets = targets || [];
                self.accessHint = '';
                self.targets.forEach(function(target) {
                    if (target.accessible === false && target.accessError) {
                        self.accessHint = target.accessError;
                    }
                });
            })
            .catch(function(error) {
                logger.warn('Pico scan failed', error);
                toast.error('Unable to scan Pico devices');
            })
            .finally(function() {
                self.loading = false;
                self.initialScanDone = true;
            });
    };

    self.showEmptyGuide = function() {
        return self.initialScanDone && !self.targets.length;
    };

    self.selectTarget = function(target) {
        if (!target) {
            return;
        }
        if (target.accessible === false) {
            toast.error(target.accessError || 'This Pico cannot be accessed');
            return;
        }
        closeModal(target);
    };

    self.refresh({ silent: false });
    self._poll = $interval(function() {
        self.refresh({ silent: true });
    }, 2000);

    $scope.$on('$destroy', function() {
        if (self._poll) {
            $interval.cancel(self._poll);
            self._poll = null;
        }
    });
}]);
