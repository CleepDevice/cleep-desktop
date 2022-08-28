angular
.module('Cleep')
.controller('preferencesController', ['$scope', 'debounceService', 'electronService', 'toastService',
function($scope, debounce, electron, toast) {
    var self = this;
    self.pref = 'general';
    self.settings = {};
    self.cacheDir = '';
    self.cachedFiles = [];

    self.$onInit = function() {
        electron.sendReturn('settings-get-all')
            .then((settings) => {
                Object.assign(this.settings, settings);
            });
        self.getCacheInfos();
    };

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
