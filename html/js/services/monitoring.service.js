/**
 * Monitoring service
 * Stores all received devices messages
 */
angular
.module('Cleep')
.service('monitoringService', ['$rootScope', 'loggerService', function($rootScope, logger) {
    var self = this;
    self.maxMessages = 100;
    self.messages = [];

    self.init = function() {
        // nothing to do, just call this to load service in angular application
    }

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

    self.clearMessages = function() {
        self.messages.splice(0, self.messages.length);
    };
}]);
