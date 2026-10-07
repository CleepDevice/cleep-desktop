/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-this-alias */
angular
.module('Cleep')
.controller('preferencesController', ['$scope', 'debounceService', 'toastService', 'settingsService', 'electronService', 'closeModal',
function($scope, debounce, toast, settingsService, electron, closeModal) {
    var self = this;
    self.pref = 'general';
    self.settings = {};
    self.cacheDir = '';
    self.cachedFiles = [];
    self.networkInterfaces = [];
    self.selectedNetworkInterface = '';
    self.networkConfig = {};
    self.networkApplying = false;
    self.networkPollTimer = null;

    self.closeModal = closeModal;

    self.$onInit = function() {
        self.getSettings();
        self.getCacheInfos();
    };

    self.loadNetworkConfig = function() {
        return electron.sendReturn('bus-get-network-config')
            .then((config) => {
                self.networkConfig = config;
                self.networkInterfaces = config.interfaces || [];
                self.selectedNetworkInterface = config.selectedInterface || '';
            })
            .catch(() => {
                toast.warning('Network settings are unavailable. Restart CleepDesktop (main process update required).');
                self.networkConfig = { busConnected: false, peerCount: 0, interfaces: [] };
                self.networkInterfaces = [];
            });
    };

    self.applyNetworkInterface = function() {
        self.networkApplying = true;
        electron.sendReturn('bus-set-network-interface', self.selectedNetworkInterface)
            .then((config) => {
                self.networkConfig = config;
                self.networkInterfaces = config.interfaces || [];
                self.selectedNetworkInterface = config.selectedInterface || '';
                if (self.settings.cleep) {
                    self.settings.cleep.networkinterface = self.selectedNetworkInterface;
                }
                self.startNetworkPeerPoll();
            })
            .catch(() => {
                toast.warning('Unable to change network interface');
            })
            .finally(() => {
                self.networkApplying = false;
            });
    };

    self.startNetworkPeerPoll = function() {
        if (self.networkPollTimer) {
            clearInterval(self.networkPollTimer);
        }
        var ticks = 0;
        self.networkPollTimer = setInterval(function() {
            ticks += 1;
            electron.sendReturn('bus-get-network-config')
                .then((config) => {
                    self.networkConfig.peerCount = config.peerCount;
                    self.networkConfig.busConnected = config.busConnected;
                });
            if (ticks >= 15) {
                clearInterval(self.networkPollTimer);
                self.networkPollTimer = null;
            }
        }, 2000);
    };

    $scope.$on('$destroy', function() {
        if (self.networkPollTimer) {
            clearInterval(self.networkPollTimer);
        }
    });

    self.getSettings = function() {
        settingsService.getAll()
            .then((settings) => {
                Object.assign(this.settings, settings);
            });
    }

    self.getCacheInfos = function() {
        electron.sendReturn('cache-get-infos')
            .then((data) => {
                self.fillArray(self.cachedFiles, data.files);
                self.cacheDir = data.dir;
            })
            .catch(() => {
                toast.warning('Unable to load cache infos');
            });
    };

    $scope.$watch(function() {
        return self.settings;
    }, function(newValue, oldValue) {
        if (Object.keys(newValue).length > 0 && Object.keys(oldValue).length > 0) {
            debounce.exec('config', self.saveSettings, 500);
        }
    }, true);

    self.saveSettings = function() {
        electron.sendReturn('settings-set-all', self.settings)
            .then(() => {
                self.getSettings();
            })
            .catch(() => {
                toast.warning('Invalid settings, please check it');
            });
    };

    self.openElectronLogs = function() {
        electron.send('open-electron-logs');
    };

    self.deleteCachedFile = function(filename) {
        electron.sendReturn('cache-delete-file', filename)
            .then(() => {
                self.getCacheInfos();
            });
    };

    self.purgeCachedFiles = function() {
        electron.sendReturn('cache-purge-files')
            .then(() => {
                self.getCacheInfos();
            });
    };

    self.fillArray = function(source, data) {
        while (source.length) source.pop();
        Object.assign(source, data);
    };
}]);
