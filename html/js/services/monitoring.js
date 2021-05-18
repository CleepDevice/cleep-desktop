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

        //append at beginning new message
        logger.debug('Monitoring message recevied:', data);
        deviceMessages.unshift(data);
    });
}]);
