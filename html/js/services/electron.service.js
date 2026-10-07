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
 * on() / registerWebview() return an unsubscribe function — call it on destroy
 * to avoid duplicate listeners (e.g. re-entering a device page).
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
     * Subscribe to a main→renderer channel.
     * @returns {function} unsubscribe
     */
    self.on = function(event, callback) {
        return ipc.on(event, function() {
            callback.apply(null, arguments);
            triggerDigest();
        });
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
