const { ipcRenderer } = require('electron');

/**
 * Handle electron features to easily use it in angularjs application
 */
angular
.module('Cleep')
.service('electronService', ['$rootScope', '$timeout', function($rootScope, $timeout) {

    var self = this;

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