const { ipcRenderer } = require('electron');

/**
 * Handle electron features to easily use it in angularjs application
 */
angular
.module('Cleep')
.service('electronService', ['$rootScope', function($rootScope) {
    var self = this;

    /**
     * Handle call from electron application
     */
    self.on = function(event, callback) {
        ipcRenderer.on(event, (event, parameters) => {
            callback(event, parameters);
            $rootScope.$digest();
        });
    };
    
    /**
     * Send event to electron
     */
    self.send = function(event, data) {
        ipcRenderer.send(event, data);
    };

    /**
     * Send event to electron and wait for response
     */
    self.sendReturn = function(event, data) {
        return ipcRenderer.sendSync(event, data);
    }
}]);