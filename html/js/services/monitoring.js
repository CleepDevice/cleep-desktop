/**
 * Monitoring service
 * Stores all received devices messages
 */
angular
.module('Cleep')
.service('monitoringService', ['$rootScope', 'logger', function($rootScope, logger) {
    var self = this;
    self.maxMessages = 100;
    self.messages = [];

    $rootScope.$on('monitoring', function(_event, data) {
        if( !data ) {
            return;
        }

        // append at beginning new message
        logger.debug('Monitoring message received:', data);
        self.messages.unshift(data);

        if (self.messages.length > self.maxMessages) {
            self.messages.pop();
        }
    });

    /**
     * Clear received messages
     */
    self.clearMessages = function() {
        self.messages.splice(0, self.messages.length);
    };

    self.init = function() {
        // it does nothing. It is used to load this service at application startup
    };
}]);
