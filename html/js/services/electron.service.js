/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-this-alias */

/**
 * Handle electron features to easily use it in angularjs application.
 * Uses the preload contextBridge (window.cleep) — no Node/Electron in the renderer.
 *
 * sendReturn unwraps the uniform invoke envelope:
 *   { ok: true, data }  → resolves with data
 *   { ok: false, error } → rejects with { code, message }
 *
 * on() / registerWebview() / onCoalesced() return an unsubscribe function.
 * onCoalesced() batches high-frequency events into one digest (rAF).
 */
angular
.module('Cleep')
.service('electronService', ['$rootScope', '$timeout', function($rootScope, $timeout) {
    var self = this;
    var ipc = window.cleep && window.cleep.ipc;

    if (!ipc) {
        throw new Error('Cleep preload bridge unavailable (window.cleep.ipc). Check BrowserWindow preload.');
    }

    function triggerDigest() {
        $timeout(function() {
            $rootScope.$digest();
        }, 0);
    }

    /**
     * Register webview new-window bridge.
     * @returns {function} unsubscribe
     */
    self.registerWebview = function(webviewDomElement) {
        return ipc.on('webview-new-window', function(_event, _webContentsId, details) {
            const customEvent = new CustomEvent('new-window');
            customEvent.details = details;
            webviewDomElement.dispatchEvent(customEvent);
        });
    };

    /**
     * Subscribe to a main→renderer channel (immediate callback + digest).
     * @returns {function} unsubscribe
     */
    self.on = function(event, callback) {
        return ipc.on(event, function() {
            callback.apply(null, arguments);
            triggerDigest();
        });
    };

    /**
     * Subscribe with coalesced UI updates — one digest per animation frame.
     *
     * @param {string} event
     * @param {function} callback  same signature as on()
     * @param {{
     *   mode?: 'latest'|'batch',
     *   keyFromArgs?: function(Array): string
     * }} [options]
     *   - latest (default): keep newest args until flush (optional keyFromArgs for fan-out)
     *   - batch: deliver every event in order on flush
     * @returns {function} unsubscribe
     */
    self.onCoalesced = function(event, callback, options) {
        options = options || {};
        var mode = options.mode === 'batch' ? 'batch' : 'latest';
        var keyFromArgs = typeof options.keyFromArgs === 'function' ? options.keyFromArgs : null;
        var pendingLatest = null;
        var pendingByKey = Object.create(null);
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
                for (var i = 0; i < batch.length; i++) {
                    callback.apply(null, batch[i]);
                }
            } else if (keyFromArgs) {
                var keys = Object.keys(pendingByKey);
                for (var k = 0; k < keys.length; k++) {
                    callback.apply(null, pendingByKey[keys[k]]);
                }
                pendingByKey = Object.create(null);
            } else if (pendingLatest) {
                var args = pendingLatest;
                pendingLatest = null;
                callback.apply(null, args);
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

        var unsubscribe = ipc.on(event, function() {
            var args = Array.prototype.slice.call(arguments);
            if (mode === 'batch') {
                pendingBatch.push(args);
            } else if (keyFromArgs) {
                pendingByKey[String(keyFromArgs(args))] = args;
            } else {
                pendingLatest = args;
            }
            schedule();
        });

        return function() {
            cancelled = true;
            pendingLatest = null;
            pendingByKey = Object.create(null);
            pendingBatch = [];
            unsubscribe();
        };
    };
    
    /**
     * Send event to electron
     */
    self.send = function(event, data) {
        ipc.send(event, data);
    };

    /**
     * Invoke main and unwrap { ok, data } / { ok, error }.
     */
    self.sendReturn = function(event, data) {
        return ipc.invoke(event, data)
            .then(function(response) {
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
    };
}]);
