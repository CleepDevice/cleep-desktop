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
    self.coreSyncAvailable = false;
    self.remoteApps = [];
    self.remoteAppsLoaded = false;
    self.remoteAppsBusy = false;
    self.syncBusy = false;
    self.CORE_SYNC_TOKEN = '__cleep_core__';

    self.refreshSyncTargets = function() {
        if (!electron.developer || !electron.developer.getStatus || !electron.developer.listApps) {
            self.syncTargets = [];
            self.coreSyncAvailable = false;
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
                self.coreSyncAvailable = Boolean(status.coreOk);
            })
            .catch(function() {
                self.syncTargets = [];
                self.coreSyncAvailable = false;
            });
    };

    self.hasUploadTargets = function() {
        return self.coreSyncAvailable || self.syncTargets.length > 0;
    };

    self.hasDownloadTargets = function() {
        return self.coreSyncAvailable || self.remoteApps.length > 0;
    };

    self.refreshRemoteApps = function($event) {
        if ($event) {
            $event.preventDefault();
            $event.stopPropagation();
        }
        if (self.remoteAppsBusy || !electron.developer || !electron.developer.listRemoteApps) {
            return;
        }
        self.remoteAppsBusy = true;
        electron.developer.listRemoteApps()
            .then(function(modules) {
                self.remoteApps = Array.isArray(modules) ? modules.slice() : [];
                self.remoteAppsLoaded = true;
                if (!self.remoteApps.length) {
                    toast.info('No applications found in /root/cleep-dev/modules');
                }
            })
            .catch(function(error) {
                self.remoteApps = [];
                self.remoteAppsLoaded = true;
                toast.warning((error && error.message) || 'Unable to list remote applications');
            })
            .finally(function() {
                self.remoteAppsBusy = false;
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
                    toast.warning(status.syncError || 'Upload failed');
                    return;
                }
                if (folderName === self.CORE_SYNC_TOKEN) {
                    toast.success('cleep uploaded');
                } else if (folderName) {
                    toast.success('Application uploaded');
                } else {
                    toast.success('Sources uploaded');
                }
            })
            .catch(function(error) {
                toast.warning((error && error.message) || 'Upload failed');
            })
            .finally(function() {
                self.syncBusy = false;
            });
    };

    self.pullNow = function(moduleName) {
        if (self.syncBusy || !electron.developer || !electron.developer.pullNow) {
            return;
        }
        self.syncBusy = true;
        var request;
        if (moduleName === self.CORE_SYNC_TOKEN) {
            request = { includeCore: true };
        } else if (moduleName) {
            request = { moduleNames: [moduleName] };
        } else {
            request = {
                moduleNames: self.remoteApps.slice(),
                includeCore: self.coreSyncAvailable,
            };
        }
        electron.developer.pullNow(request)
            .then(function(status) {
                if (status && status.syncStatus === 'failed') {
                    toast.warning(status.syncError || 'Download failed');
                    return;
                }
                if (moduleName === self.CORE_SYNC_TOKEN) {
                    toast.success('cleep downloaded');
                } else if (moduleName) {
                    toast.success(moduleName + ' downloaded');
                } else {
                    toast.success('Sources downloaded');
                }
            })
            .catch(function(error) {
                toast.warning((error && error.message) || 'Download failed');
            })
            .finally(function() {
                self.syncBusy = false;
            });
    };

    self.$onInit = function() {
        self.refreshSyncTargets();
    };
}]);
