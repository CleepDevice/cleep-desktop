angular
.module('Cleep')
.service('monitoringService', ['loggerService', 'electronService', '$filter', 'ipcLifecycle',
function(logger, electron, $filter, ipcLifecycle) {
    var self = this;
    self.maxMessages = 100;
    self.messages = [];
    var paramsSummary = $filter('messageParamsSummary');

    self.addIpcs = function() {
        // Batch bus messages: many events → one digest per frame.
        self._unsubscribers.push(
            electron.devices.onMessage(self.onDevicesMessage.bind(self)),
        );
    };

    ipcLifecycle.attach(self, self.addIpcs);

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
