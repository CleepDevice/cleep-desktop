/**
 * Monitoring service
 * Stores all received devices messages
 */
angular
.module('Cleep')
.service('monitoringService', ['$rootScope', 'logger', function($rootScope, logger) {
    var self = this;
    self.messages = [];

    $rootScope.$on('monitoring', function(_event, data) {
        if( !data ) {
            return;
        }

        // append at beginning new message
        logger.debug('Monitoring message received:', data);
        self.messages.unshift(data);
    });

    self.init = function() {
        // it does nothing. It is used to load this service at application startup
    }
}]);
