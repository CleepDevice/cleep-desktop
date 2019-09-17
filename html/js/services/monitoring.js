/**
 * Monitoring service
 * Stores all received devices messages
 */
var monitoringService = function($rootScope, logger) {
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
}

var Cleep = angular.module('Cleep');
Cleep.service('monitoringService', ['$rootScope', 'logger', monitoringService]);