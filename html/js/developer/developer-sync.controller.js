angular
.module('Cleep')
.controller('developerSyncController', [
    '$scope',
    '$rootScope',
    '$timeout',
    'developerSyncLogService',
    'electronService',
    'toastService',
    function($scope, $rootScope, $timeout, developerSyncLogService, electron, toast) {
    var self = this;
    var DEVICE_LOG_POLL_MS = 3000;
    var deviceLogTimer = null;
    var deviceLogSize = null;
    var deviceLogContentSeen = null;

    self.syncLog = developerSyncLogService;
    self.syncTargets = [];
    self.coreSyncAvailable = false;
    self.remoteApps = [];
    self.remoteAppsLoaded = false;
    self.remoteAppsBusy = false;
    self.syncBusy = false;
    self.CORE_SYNC_TOKEN = '__cleep_core__';

    self.deviceLogContent = '';
    self.deviceLogError = '';
    self.deviceLogBusy = false;
    self.deviceLogFollow = false;

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

    self.openDeveloperPreferences = function() {
        $rootScope.$emit('open-preferences', { tab: 'developer' });
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

    function scrollDeviceLogToBottom() {
        // Wait for Angular to paint the new text, then pin to bottom.
        $timeout(function() {
            requestAnimationFrame(function() {
                var el = document.getElementById('developer-device-log');
                if (el) {
                    el.scrollTop = el.scrollHeight;
                }
            });
        }, 0);
    }

    function scheduleDeviceLogPoll() {
        if (deviceLogTimer) {
            $timeout.cancel(deviceLogTimer);
            deviceLogTimer = null;
        }
        if (!self.deviceLogFollow) {
            return;
        }
        deviceLogTimer = $timeout(function() {
            deviceLogTimer = null;
            self.refreshDeviceLogs(false).finally(function() {
                scheduleDeviceLogPoll();
            });
        }, DEVICE_LOG_POLL_MS);
    }

    function persistDeviceLogFollow() {
        if (!electron.settings || !electron.settings.set) {
            return;
        }
        electron.settings.set({
            key: 'cleep.developerdevicelogslive',
            value: self.deviceLogFollow,
        });
    }

    self.toggleDeviceLogFollow = function() {
        self.deviceLogFollow = !self.deviceLogFollow;
        persistDeviceLogFollow();
        if (self.deviceLogFollow) {
            self.refreshDeviceLogs(true).finally(scheduleDeviceLogPoll);
        } else if (deviceLogTimer) {
            $timeout.cancel(deviceLogTimer);
            deviceLogTimer = null;
        }
    };

    self.refreshDeviceLogs = function(force) {
        if (!electron.developer || !electron.developer.fetchDeviceLogs) {
            self.deviceLogError = 'Device logs unavailable';
            return Promise.resolve();
        }
        if (self.deviceLogBusy) {
            return Promise.resolve();
        }
        self.deviceLogBusy = true;
        return electron.developer.fetchDeviceLogs()
            .then(function(payload) {
                var size = payload && typeof payload.size === 'number' ? payload.size : 0;
                var content = payload && typeof payload.content === 'string' ? payload.content : '';
                self.deviceLogError = '';
                if (
                    !force &&
                    deviceLogSize !== null &&
                    size === deviceLogSize &&
                    content === deviceLogContentSeen
                ) {
                    return;
                }
                var changed = content !== deviceLogContentSeen;
                deviceLogSize = size;
                deviceLogContentSeen = content;
                self.deviceLogContent = content;
                if (force || changed) {
                    scrollDeviceLogToBottom();
                }
            })
            .catch(function(error) {
                self.deviceLogError = (error && error.message) || 'Unable to fetch device logs';
            })
            .finally(function() {
                self.deviceLogBusy = false;
            });
    };

    self.$onInit = function() {
        self.refreshSyncTargets();
        var livePref = Promise.resolve(false);
        if (electron.settings && electron.settings.get) {
            livePref = electron.settings.get('cleep.developerdevicelogslive')
                .then(function(value) {
                    return Boolean(value);
                })
                .catch(function() {
                    return false;
                });
        }
        livePref.then(function(live) {
            self.deviceLogFollow = live;
            return self.refreshDeviceLogs(true).finally(function() {
                if (self.deviceLogFollow) {
                    scheduleDeviceLogPoll();
                }
            });
        });
    };

    $scope.$on('$destroy', function() {
        if (deviceLogTimer) {
            $timeout.cancel(deviceLogTimer);
            deviceLogTimer = null;
        }
    });
}]);
