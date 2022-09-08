angular
.module('Cleep')
.service('monitoringService', ['loggerService', 'electronService', function(logger, electron) {
    var self = this;
    self.maxMessages = 100;
    self.messages = [];

    self.init = function() {
        self.addIpcs();
    };
 
    self.addIpcs = function() {
        electron.on('devices-message', self.onDevicesMessage.bind(self));
    };

    self.onDevicesMessage = function(_event, message) {
        if( !message ) {
            return;
        }

        // append new message at list beginning
        logger.debug('Monitoring message received:', message);
        self.messages.unshift(message);

        if (self.messages.length > self.maxMessages) {
            self.messages.pop();
        }
    };

    self.clearMessages = function() {
        self.messages.splice(0, self.messages.length);
    };
}]);
