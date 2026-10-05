/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-this-alias */
angular
.module('Cleep')
.controller('preferencesController', ['$scope', 'debounceService', 'toastService', 'settingsService', 'electronService',
function($scope, debounce, toast, settingsService, electron) {
    var self = this;
    self.pref = 'general';
    self.settings = {};
    self.cacheDir = '';
    self.cachedFiles = [];

    self.$onInit = function() {
        self.getSettings();
        self.getCacheInfos();
    };

    self.getSettings = function() {
        settingsService.getAll()
            .then((settings) => {
                Object.assign(this.settings, settings);
            });
    }

    self.getCacheInfos = function() {
        electron.sendReturn('cache-get-infos')
            .then((resp) => {
                if (!resp.error) {
                    self.fillArray(self.cachedFiles, resp.data.files);
                    self.cacheDir = resp.data.dir;
                }
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
            .then((success) => {
                if (!success) {
                    toast.warning('Invalid settings, please check it');
                }
                self.getSettings();
            })
            .catch(() => { /* handle rejection */ });
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
