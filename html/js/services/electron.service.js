
/**
 * Angular façade over window.cleep.api (semantic preload bridge).
 *
 * Invoke helpers unwrap { ok, data } / { ok, error } and trigger a digest.
 * Hot subscriptions bake in onCoalesced (rAF) where progress/message spam would hurt.
 */
angular
.module('Cleep')
.service('electronService', ['$rootScope', '$timeout', function($rootScope, $timeout) {
    var self = this;
    var api = window.cleep && window.cleep.api;

    if (!api) {
        throw new Error('Cleep preload bridge unavailable (window.cleep.api). Check BrowserWindow preload.');
    }

    function triggerDigest() {
        $timeout(function() {
            $rootScope.$digest();
        }, 0);
    }

    function unwrapInvoke(promise) {
        return promise.then(function(response) {
            triggerDigest();
            if (!response || typeof response.ok !== 'boolean') {
                return Promise.reject({
                    code: 'INVALID_IPC_ENVELOPE',
                    message: 'Main process returned an invalid IPC response',
                });
            }
            if (!response.ok) {
                return Promise.reject(response.error || {
                    code: 'UNKNOWN_IPC_ERROR',
                    message: 'Unknown IPC error',
                });
            }
            return response.data;
        });
    }

    function bindInvoke(fn) {
        return function() {
            if (typeof fn !== 'function') {
                return Promise.reject({
                    code: 'IPC_BRIDGE_STALE',
                    message: 'Preload bridge is outdated. Restart CleepDesktop to reload it.',
                });
            }
            return unwrapInvoke(fn.apply(null, arguments));
        };
    }

    function bindSend(fn) {
        return function() {
            if (typeof fn !== 'function') {
                return;
            }
            return fn.apply(null, arguments);
        };
    }

    /**
     * Immediate subscribe + digest (rare events).
     * @param {function(Function): function} subscribe  api.*.onX(listener) → unsubscribe
     */
    function bindOn(subscribe) {
        return function(callback) {
            return subscribe(function() {
                callback.apply(null, arguments);
                triggerDigest();
            });
        };
    }

    /**
     * Coalesced subscribe - one digest per animation frame.
     * @param {function(Function): function} subscribe
     * @param {{ mode?: 'latest'|'batch', keyFromArgs?: function(Array): string }} [defaultOptions]
     */
    function bindOnCoalesced(subscribe, defaultOptions) {
        return function(callback, options) {
            options = Object.assign({}, defaultOptions || {}, options || {});
            var mode = options.mode === 'batch' ? 'batch' : 'latest';
            var keyFromArgs = typeof options.keyFromArgs === 'function' ? options.keyFromArgs : null;
            var pendingLatest = null;
            var pendingByKey = new Map();
            var pendingBatch = [];
            var scheduled = false;
            var cancelled = false;

            function flush() {
                scheduled = false;
                if (cancelled) {
                    return;
                }

                if (mode === 'batch') {
                    var batch = pendingBatch;
                    pendingBatch = [];
                    for (const args of batch) {
                        callback(...args);
                    }
                } else if (keyFromArgs) {
                    for (const args of pendingByKey.values()) {
                        callback(...args);
                    }
                    pendingByKey.clear();
                } else if (pendingLatest) {
                    var args = pendingLatest;
                    pendingLatest = null;
                    callback(...args);
                }

                triggerDigest();
            }

            function schedule() {
                if (scheduled || cancelled) {
                    return;
                }
                scheduled = true;
                if (typeof requestAnimationFrame === 'function') {
                    requestAnimationFrame(function() {
                        $timeout(flush, 0, false);
                    });
                } else {
                    $timeout(flush, 32, false);
                }
            }

            var unsubscribe = subscribe(function() {
                var listenerArgs = Array.prototype.slice.call(arguments);
                if (mode === 'batch') {
                    pendingBatch.push(listenerArgs);
                } else if (keyFromArgs) {
                    pendingByKey.set(String(keyFromArgs(listenerArgs)), listenerArgs);
                } else {
                    pendingLatest = listenerArgs;
                }
                schedule();
            });

            return function() {
                cancelled = true;
                pendingLatest = null;
                pendingByKey.clear();
                pendingBatch = [];
                unsubscribe();
            };
        };
    }

    self.registerWebview = function(webviewDomElement) {
        var unsubNewWindow = api.webview.onNewWindow(function(_event, _webContentsId, details) {
            const customEvent = new CustomEvent('new-window');
            customEvent.details = details;
            webviewDomElement.dispatchEvent(customEvent);
        });
        var unsubHttpError = api.webview.onHttpError(function(_event, webContentsId, details) {
            if (typeof webviewDomElement.getWebContentsId === 'function') {
                try {
                    if (webviewDomElement.getWebContentsId() !== webContentsId) {
                        return;
                    }
                } catch (_error) {
                    return;
                }
            }
            const customEvent = new CustomEvent('http-error');
            customEvent.details = details;
            webviewDomElement.dispatchEvent(customEvent);
        });
        return function() {
            if (unsubNewWindow) {
                unsubNewWindow();
            }
            if (unsubHttpError) {
                unsubHttpError();
            }
        };
    };

    self.app = {
        getChangelog: bindInvoke(api.app.getChangelog),
        onOpenPage: bindOn(api.app.onOpenPage),
        onOpenModal: bindOn(api.app.onOpenModal),
        onAuthError: bindOn(api.app.onAuthError),
    };

    self.bus = {
        getNetworkConfig: bindInvoke(api.bus.getNetworkConfig),
        setNetworkInterface: bindInvoke(api.bus.setNetworkInterface),
    };

    self.cache = {
        getInfos: bindInvoke(api.cache.getInfos),
        deleteFile: bindInvoke(api.cache.deleteFile),
        purgeFiles: bindInvoke(api.cache.purgeFiles),
    };

    self.news = {
        getCache: bindInvoke(api.news && api.news.getCache),
        saveCache: bindInvoke(api.news && api.news.saveCache),
    };

    self.developer = {
        getStatus: bindInvoke(api.developer && api.developer.getStatus),
        listApps: bindInvoke(api.developer && api.developer.listApps),
        saveSsh: bindInvoke(api.developer && api.developer.saveSsh),
        clearSsh: bindInvoke(api.developer && api.developer.clearSsh),
        syncNow: bindInvoke(api.developer && api.developer.syncNow), // optional folderNames[]
        onStatusChanged: bindOn(api.developer && api.developer.onStatusChanged),
        onSyncLog: bindOn(api.developer && api.developer.onSyncLog),
    };

    self.devices = {
        getUiState: bindInvoke(api.devices.getUiState),
        deleteDevice: bindInvoke(api.devices.deleteDevice),
        updateAuth: bindInvoke(api.devices.updateAuth),
        prepareAuth: bindInvoke(api.devices.prepareAuth),
        refreshRemoteUrl: bindInvoke(api.devices.refreshRemoteUrl),
        bindWebview: bindInvoke(api.devices.bindWebview),
        onUpdated: bindOn(api.devices.onUpdated),
        onAuthUpdated: bindOn(api.devices.onAuthUpdated),
        onBusConnected: bindOn(api.devices.onBusConnected),
        onBusError: bindOn(api.devices.onBusError),
        onBusUpdating: bindOn(api.devices.onBusUpdating),
        onMessage: bindOnCoalesced(api.devices.onMessage, { mode: 'batch' }),
    };

    self.download = {
        start: bindSend(api.download.start),
        cancel: bindSend(api.download.cancel),
        onStarted: bindOn(api.download.onStarted),
        onStatus: bindOnCoalesced(api.download.onStatus, {
            mode: 'latest',
            keyFromArgs: function(args) {
                var payload = args[1] || {};
                return payload.downloadId || 'unknown';
            },
        }),
    };

    self.install = {
        getIsos: bindInvoke(api.install.getIsos),
        getDrives: bindInvoke(api.install.getDrives),
        hasWifi: bindInvoke(api.install.hasWifi),
        getWifiNetworks: bindInvoke(api.install.getWifiNetworks),
        refreshWifiNetworks: bindInvoke(api.install.refreshWifiNetworks),
        start: bindSend(api.install.start),
        cancel: bindSend(api.install.cancel),
        onProgress: bindOnCoalesced(api.install.onProgress, { mode: 'latest' }),
    };

    self.logger = {
        log: bindSend(api.logger.log),
        openLogs: bindSend(api.logger.openLogs),
        getLogPath: bindInvoke(api.logger.getLogPath),
    };

    self.settings = {
        get: bindInvoke(api.settings.get),
        getAll: bindInvoke(api.settings.getAll),
        getSelected: bindInvoke(api.settings.getSelected),
        set: bindSend(api.settings.set),
        setAll: bindInvoke(api.settings.setAll),
        filepath: bindInvoke(api.settings.filepath),
        has: bindInvoke(api.settings.has),
    };

    self.shell = {
        openUrl: bindSend(api.shell.openUrl),
        openDialog: bindInvoke(api.shell.openDialog),
    };

    self.updater = {
        checkForUpdates: bindInvoke(api.updater.checkForUpdates),
        getSoftwareVersions: bindInvoke(api.updater.getSoftwareVersions),
        quitAndInstall: bindSend(api.updater.quitAndInstall),
        onCleepDesktopAvailable: bindOn(api.updater.onCleepDesktopAvailable),
        onCleepDesktopProgress: bindOnCoalesced(api.updater.onCleepDesktopProgress, { mode: 'latest' }),
        onFlashToolAvailable: bindOn(api.updater.onFlashToolAvailable),
        onFlashToolProgress: bindOnCoalesced(api.updater.onFlashToolProgress, { mode: 'latest' }),
        onCleepbusAvailable: bindOn(api.updater.onCleepbusAvailable),
        onCleepbusProgress: bindOnCoalesced(api.updater.onCleepbusProgress, { mode: 'latest' }),
    };

    self.vault = {
        getStatus: bindInvoke(api.vault.getStatus),
        enable: bindInvoke(api.vault.enable),
        disable: bindInvoke(api.vault.disable),
        unlock: bindInvoke(api.vault.unlock),
        lock: bindInvoke(api.vault.lock),
        dismissUnlock: bindInvoke(api.vault.dismissUnlock),
        notifyUnlockDialogClosed: bindInvoke(api.vault.notifyUnlockDialogClosed),
        ensureUnlocked: bindInvoke(api.vault.ensureUnlocked),
        changePassphrase: bindInvoke(api.vault.changePassphrase),
        recover: bindInvoke(api.vault.recover),
        regenerateRecoveryCodes: bindInvoke(api.vault.regenerateRecoveryCodes),
        onUnlockRequired: bindOn(api.vault.onUnlockRequired),
        onStatusChanged: bindOn(api.vault.onStatusChanged),
    };

    self.website = {
        getSession: bindInvoke(api.website && api.website.getSession),
        loadCredentials: bindInvoke(api.website && api.website.loadCredentials),
        login: bindInvoke(api.website && api.website.login),
        logout: bindInvoke(api.website && api.website.logout),
        getApiUrl: bindInvoke(api.website && api.website.getApiUrl),
        onChanged: bindOn(api.website && api.website.onChanged),
    };
}]);
