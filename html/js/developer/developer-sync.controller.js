angular
.module('Cleep')
.controller('developerSyncController', [
    'developerSyncLogService',
    'electronService',
    'toastService',
    function(developerSyncLogService, electron, toast) {
    var self = this;
    self.syncLog = developerSyncLogService;
    self.syncTargets = [];
    self.syncBusy = false;

    self.refreshSyncTargets = function() {
        if (!electron.developer || !electron.developer.getStatus || !electron.developer.listApps) {
            self.syncTargets = [];
            return Promise.resolve();
        }
        return Promise.all([electron.developer.getStatus(), electron.developer.listApps()])
            .then(function(results) {
                var status = results[0] || {};
                var entries = results[1] || [];
                var selected = {};
                (status.selectedApps || []).forEach(function(folderName) {
                    selected[folderName] = true;
                });
                self.syncTargets = entries.filter(function(entry) {
                    return entry.valid && selected[entry.folderName];
                });
            })
            .catch(function() {
                self.syncTargets = [];
            });
    };

    self.syncNow = function(folderName) {
        if (self.syncBusy || !electron.developer || !electron.developer.syncNow) {
            return;
        }
        self.syncBusy = true;
        var folderNames = folderName ? [folderName] : undefined;
        electron.developer.syncNow(folderNames)
            .then(function(status) {
                if (status && status.syncStatus === 'failed') {
                    toast.warning(status.syncError || 'Synchronization failed');
                    return;
                }
                toast.success(folderName ? 'Application synchronized' : 'Applications synchronized');
            })
            .catch(function(error) {
                toast.warning((error && error.message) || 'Unable to synchronize');
            })
            .finally(function() {
                self.syncBusy = false;
            });
    };

    self.$onInit = function() {
        self.refreshSyncTargets();
    };
}]);
