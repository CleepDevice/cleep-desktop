/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-this-alias */
angular
.module('Cleep')
.service('monitoringService', ['loggerService', 'electronService', '$filter', function(logger, electron, $filter) {
    var self = this;
    self.maxMessages = 100;
    self.messages = [];
    var paramsSummary = $filter('messageParamsSummary');

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

        message.summary = paramsSummary(message.message && message.message.params);
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
