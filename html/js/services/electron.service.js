/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-this-alias */

/**
 * Handle electron features to easily use it in angularjs application.
 * Uses the preload contextBridge (window.cleep) — no Node/Electron in the renderer.
 */
angular
.module('Cleep')
.service('electronService', ['$rootScope', '$timeout', function($rootScope, $timeout) {
    var self = this;
    var ipc = window.cleep && window.cleep.ipc;

    if (!ipc) {
        throw new Error('Cleep preload bridge unavailable (window.cleep.ipc). Check BrowserWindow preload.');
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
            $timeout(function() {
                $rootScope.$digest();
            }, 0);
        });
    };
    
    /**
     * Send event to electron
     */
    self.send = function(event, data) {
        ipc.send(event, data);
    };

    /**
     * Send event to electron and return promise
     */
    self.sendReturn = function(event, data) {
        return ipc.invoke(event, data)
            .then(function(response) {
                $timeout(function() {
                    $rootScope.$digest();
                }, 0);
                return response;
            });
    };
}]);
