angular
.module('Cleep')
.controller('developerPipInstallDialogController', [
    '$scope',
    '$timeout',
    'closeModal',
    'electronService',
    function($scope, $timeout, closeModal, electron) {
    var self = this;
    var unsubscribeLog = null;
    var logEl = null;

    self.closeModal = closeModal;
    self.log = '';
    self.busy = false;
    self.done = false;
    self.success = false;
    self.error = '';
    self.includeTest = false;
    self.syncCore = false;

    function scrollLogToBottom() {
        if (!logEl) {
            logEl = document.getElementById('developer-pip-install-log');
        }
        if (logEl) {
            logEl.scrollTop = logEl.scrollHeight;
        }
    }

    function appendLog(chunk) {
        self.log += String(chunk || '');
        $timeout(scrollLogToBottom, 0);
    }

    function clearLogSubscription() {
        if (unsubscribeLog) {
            unsubscribeLog();
            unsubscribeLog = null;
        }
    }

    self.startInstall = function() {
        if (self.busy) {
            return;
        }
        if (!electron.developer || !electron.developer.installRequirements) {
            self.done = true;
            self.success = false;
            self.error = 'Install requirements API is unavailable';
            self.log = self.error + '\n';
            return;
        }

        self.busy = true;
        self.done = false;
        self.success = false;
        self.error = '';
        self.log = '';

        clearLogSubscription();
        if (electron.developer.onPipInstallLog) {
            unsubscribeLog = electron.developer.onPipInstallLog(function(_event, payload) {
                appendLog(payload && payload.chunk);
            });
        }

        electron.developer.installRequirements({
            includeTest: Boolean(self.includeTest),
            syncCore: Boolean(self.syncCore),
        })
            .then(function() {
                self.success = true;
            })
            .catch(function(error) {
                self.success = false;
                self.error = (error && error.message) || 'Installation failed';
                if (self.log.indexOf(self.error) < 0) {
                    appendLog('\n' + self.error + '\n');
                }
            })
            .finally(function() {
                self.busy = false;
                self.done = true;
                clearLogSubscription();
                $timeout(scrollLogToBottom, 0);
            });
    };

    $scope.$on('$destroy', function() {
        clearLogSubscription();
    });
}]);
