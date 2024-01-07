/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-this-alias */
const { ipcRenderer } = require('electron');

/**
 * Handle electron features to easily use it in angularjs application
 */
angular
.module('Cleep')
.service('electronService', ['$rootScope', '$timeout', function($rootScope, $timeout) {
    var self = this;

    /**
     * Register webview
     * Replace webview new-window event deprecated in electron22 https://www.electronjs.org/docs/latest/breaking-changes#removed-webview-new-window-event
     */
    self.registerWebview = function(webviewDomElement) {
        ipcRenderer.on('webview-new-window', (_event, _webContentsId, details) => {
            const customEvent = new CustomEvent('new-window');
            customEvent.details = details;
            webviewDomElement.dispatchEvent(customEvent);
        })
    };

    /**
     * Handle call from electron application
     */
    self.on = function(event, callback) {
        ipcRenderer.on(event, (event, parameters) => {
            callback(event, parameters);
            $timeout(() => {
                $rootScope.$digest();
            }, 500);
        });
    };
    
    /**
     * Send event to electron
     */
    self.send = function(event, data) {
        ipcRenderer.send(event, data);
    };

    /**
     * Send event to electron and return promise
     */
    self.sendReturn = function(event, data) {
        return ipcRenderer.invoke(event, data)
            .then((response) => {
                $timeout(() => {
                    $rootScope.$digest();
                }, 500);
                return response;
            });
    }
}]);