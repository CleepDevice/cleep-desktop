angular
.module('Cleep')
.controller('developerSyncController', [
    '$scope',
    '$rootScope',
    '$timeout',
    'developerSyncLogService',
    'electronService',
    'toastService',
    'modalService',
    function($scope, $rootScope, $timeout, developerSyncLogService, electron, toast, modalService) {
    var self = this;
    var DEVICE_LOG_POLL_MS = 3000;
    var deviceLogTimer = null;
    var deviceLogSize = null;
    var deviceLogContentSeen = null;

    self.syncLog = developerSyncLogService;
    self.syncTargets = [];
    self.coreSyncAvailable = false;
    self.deviceHostname = '';
    self.deviceIp = '';
    self.remoteApps = [];
    self.remoteAppsLoaded = false;
    self.remoteAppsBusy = false;
    self.syncBusy = false;
    self.pipInstallBusy = false;
    self.CORE_SYNC_TOKEN = '__cleep_core__';

    self.deviceLogContent = '';
    self.deviceLogError = '';
    self.deviceLogBusy = false;
    self.deviceLogFollow = false;
    /** When true, new log content pins the view to the bottom. Cleared by scrolling up. */
    self.deviceLogStickToBottom = true;
    self.deviceLogCtx = {
        open: false,
        x: 0,
        y: 0,
        hasSelection: false,
        selectedText: '',
    };

    self.refreshSyncTargets = function() {
        if (!electron.developer || !electron.developer.getStatus || !electron.developer.listApps) {
            self.syncTargets = [];
            self.coreSyncAvailable = false;
            self.deviceHostname = '';
            self.deviceIp = '';
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
                self.deviceHostname = status.deviceHostname || '';
                self.deviceIp = status.deviceIp || '';
            })
            .catch(function() {
                self.syncTargets = [];
                self.coreSyncAvailable = false;
                self.deviceHostname = '';
                self.deviceIp = '';
            });
    };

    self.openDeveloperPreferences = function() {
        $rootScope.$emit('open-preferences', { tab: 'developer' });
    };

    self.openInstallRequirements = function() {
        if (self.pipInstallBusy) {
            return;
        }
        self.pipInstallBusy = true;
        modalService.open(
            'developerPipInstallDialogController',
            'js/developer/developer-pip-install-dialog.html'
        ).finally(function() {
            self.pipInstallBusy = false;
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

    function getDeviceLogEl() {
        return document.getElementById('developer-device-log');
    }

    function isDeviceLogNearBottom(el) {
        if (!el) {
            return true;
        }
        return el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
    }

    function scrollDeviceLogToBottom() {
        // Wait for Angular to paint the new text, then pin to bottom.
        $timeout(function() {
            requestAnimationFrame(function() {
                var el = getDeviceLogEl();
                if (el) {
                    el.scrollTop = el.scrollHeight;
                    self.deviceLogStickToBottom = true;
                }
            });
        }, 0);
    }

    function onDeviceLogScroll() {
        var stuck = isDeviceLogNearBottom(getDeviceLogEl());
        if (stuck === self.deviceLogStickToBottom) {
            return;
        }
        self.deviceLogStickToBottom = stuck;
        $scope.$applyAsync();
    }

    function bindDeviceLogScroll() {
        var el = getDeviceLogEl();
        if (!el || el._cleepScrollBound) {
            return;
        }
        el._cleepScrollBound = true;
        el.addEventListener('scroll', onDeviceLogScroll, { passive: true });
        el.addEventListener('contextmenu', onDeviceLogContextMenu);
        $scope.$on('$destroy', function() {
            el.removeEventListener('scroll', onDeviceLogScroll);
            el.removeEventListener('contextmenu', onDeviceLogContextMenu);
            document.removeEventListener('mousedown', onDocumentMouseDownForLogCtx, true);
        });
    }

    function getDeviceLogSelection() {
        var el = getDeviceLogEl();
        var sel = window.getSelection && window.getSelection();
        if (!el || !sel || !sel.rangeCount) {
            return '';
        }
        if (!sel.anchorNode || !el.contains(sel.anchorNode)) {
            return '';
        }
        return String(sel.toString() || '');
    }

    function onDeviceLogContextMenu(event) {
        event.preventDefault();
        event.stopPropagation();
        var selected = getDeviceLogSelection();
        var menuWidth = 180;
        var menuHeight = 80;
        var x = Math.min(event.clientX, window.innerWidth - menuWidth - 8);
        var y = Math.min(event.clientY, window.innerHeight - menuHeight - 8);
        self.deviceLogCtx = {
            open: true,
            x: Math.max(8, x),
            y: Math.max(8, y),
            hasSelection: selected.length > 0,
            selectedText: selected,
        };
        $scope.$applyAsync();
    }

    function onDocumentMouseDownForLogCtx(event) {
        if (!self.deviceLogCtx.open) {
            return;
        }
        var menu = document.querySelector('.developer-device-log-context');
        if (menu && menu.contains(event.target)) {
            return;
        }
        self.closeDeviceLogCtx();
        $scope.$applyAsync();
    }

    function copyTextToClipboard(text, successMessage) {
        var value = String(text || '');
        if (!value) {
            toast.info('Nothing to copy');
            return Promise.resolve();
        }
        var write = navigator.clipboard && navigator.clipboard.writeText
            ? navigator.clipboard.writeText(value)
            : Promise.reject(new Error('clipboard unavailable'));
        return write
            .then(function() {
                toast.info(successMessage || 'Copied to clipboard');
            })
            .catch(function() {
                toast.warning('Unable to copy to clipboard');
            });
    }

    self.closeDeviceLogCtx = function() {
        self.deviceLogCtx.open = false;
    };

    self.copyDeviceLogSelection = function() {
        var text = self.deviceLogCtx.selectedText;
        self.closeDeviceLogCtx();
        return copyTextToClipboard(text, 'Selection copied');
    };

    self.copyAllDeviceLogs = function() {
        self.closeDeviceLogCtx();
        return copyTextToClipboard(self.deviceLogContent, 'Logs copied');
    };

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
            self.refreshDeviceLogs(true, true).finally(scheduleDeviceLogPoll);
        } else if (deviceLogTimer) {
            $timeout.cancel(deviceLogTimer);
            deviceLogTimer = null;
        }
    };

    /** Jump to latest lines and re-enable auto-scroll on new content. */
    self.jumpDeviceLogToBottom = function() {
        self.deviceLogStickToBottom = true;
        scrollDeviceLogToBottom();
    };

    /**
     * @param {boolean} force reload even if size unchanged
     * @param {boolean} [pinToBottom] force pin + scroll (initial load / resume live)
     */
    self.refreshDeviceLogs = function(force, pinToBottom) {
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
                if (pinToBottom) {
                    self.deviceLogStickToBottom = true;
                    scrollDeviceLogToBottom();
                } else if ((force || changed) && self.deviceLogStickToBottom) {
                    scrollDeviceLogToBottom();
                }
            })
            .catch(function(error) {
                self.deviceLogError = (error && error.message) || 'Unable to fetch device logs';
            })
            .finally(function() {
                self.deviceLogBusy = false;
                bindDeviceLogScroll();
            });
    };

    self.$onInit = function() {
        document.addEventListener('mousedown', onDocumentMouseDownForLogCtx, true);
        self.refreshSyncTargets();
        var unsubStatus = null;
        if (electron.developer && electron.developer.onStatusChanged) {
            // Do NOT pass the IPC unsubscribe directly to $on('$destroy'):
            // Angular calls listeners with a Scope event, and contextBridge
            // throws "An object could not be cloned" when that event crosses.
            unsubStatus = electron.developer.onStatusChanged(function(_event, status) {
                self.deviceHostname = (status && status.deviceHostname) || '';
                self.deviceIp = (status && status.deviceIp) || '';
                self.coreSyncAvailable = Boolean(status && status.coreOk);
            });
        }
        $scope.$on('$destroy', function() {
            if (typeof unsubStatus === 'function') {
                unsubStatus();
            }
            if (deviceLogTimer) {
                $timeout.cancel(deviceLogTimer);
                deviceLogTimer = null;
            }
        });
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
            return self.refreshDeviceLogs(true, true).finally(function() {
                if (self.deviceLogFollow) {
                    scheduleDeviceLogPoll();
                }
            });
        });
    };
}]);
