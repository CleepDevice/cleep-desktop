angular
.module('Cleep')
.controller('preferencesController', ['$rootScope', '$scope', 'cleepService', 'debounceService', 'closeModal', 'electronService', 'toastService', 'electronService'
function($rootScope, $scope, cleepService, debounce, closeModal, electron, toast, electron) {
    
    var self = this;
    self.pref = 'general';
    self.settings = {};
    self.noproxy = false;
    self.manualproxy = false;
    self.coreLogs = '';
    self.cacheDir = '';
    self.cacheds = [];
    self.closeModal = closeModal;

    self.$onInit = function() {
        electron.sendReturn('settings-get-all')
            .then((settings) => {
                Object.assign(this.settings, settings);
            });
    };

    $scope.$watch(function() {
        return self.config;
    }, function(newValue, oldValue) {
        if (Object.keys(newValue).length > 0 && Object.keys(oldValue).length > 0) {
            if( !self.checkConfig() ) {
                toast.warning('Invalid configuration. Please check it');
            }

            debounce.exec('config', self.setConfig, 500)
                .then(() => { /* handle rejection */ })
                .catch(() => { /* handle rejection */ });
        }
    }, true);

    self.checkConfig = function() {
        if (self.config) {
            if (self.config.remote && !self.config.remote.rpcport)
                return false;
            if (self.config.proxy && !self.config.proxy.host)
                return false;
            if (self.config.proxy && !self.config.proxy.port)
                return false;

            return true;
        }

        return false;
    };

    self.updateProxyMode = function(mode) {
        if (mode === 'noproxy') {
            self.noproxy = true;
            self.manualproxy = false;
        } else if (mode === 'manualproxy') {
            self.noproxy = false;
            self.manualproxy = true;
        }
        self.config.proxy.mode = mode;
    };

    self.openCoreLogs = function() {
        electron.send('open-path', self.coreLogs);
    };

    self.openElectronLogs = function() {
        electron.send('open-electron-logs');
    };

    self.downloadZippedLogs = function() {
        electron.sendReturn('get-electron-log-path')
            .then((electronLogPath) => {
                return cleepService.sendCommand('get_zipped_logs', 'core', {'electron_log_path': electronLogPath});
            })
            .then(function(resp) {
                electron.send('open-path', resp.data);
            });
    };

    self.purgeCacheFile = function(filename) {
        cleepService.sendCommand('delete_cached_file', 'cache', {filename:filename})
            .then(function(resp) {
                self.cacheds = resp.data;
            });
    };

    self.purgeCachedFiles = function() {
        cleepService.sendCommand('purge_cached_files', 'cache')
            .then(function(resp) {
                self.cacheds = resp.data;
            });
    };
}]);
