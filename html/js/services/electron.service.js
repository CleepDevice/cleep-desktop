/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-this-alias */

/**
 * Handle electron features to easily use it in angularjs application.
 * Uses the preload contextBridge (window.cleep) — no Node/Electron in the renderer.
 *
 * sendReturn unwraps the uniform invoke envelope:
 *   { ok: true, data }  → resolves with data
 *   { ok: false, error } → rejects with { code, message }
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
     * Register webview
     * Replace webview new-window event deprecated in electron22 https://www.electronjs.org/docs/latest/breaking-changes#removed-webview-new-window-event
     */
    self.registerWebview = function(webviewDomElement) {
        ipc.on('webview-new-window', function(_event, _webContentsId, details) {
            const customEvent = new CustomEvent('new-window');
            customEvent.details = details;
            webviewDomElement.dispatchEvent(customEvent);
        });
    };

    /**
     * Handle call from electron application
     */
    self.on = function(event, callback) {
        ipc.on(event, function() {
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
