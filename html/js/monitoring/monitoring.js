var Cleep = angular.module('Cleep');

/**
 * Monitoring controller
 * Display messages from all devices received on bus
 */
var monitoringController = function($rootScope, $scope, cleepService, logger)
{
    var self = this;
    self.messages = [];
    
    //watch for message event to refresh messages list
    $rootScope.$on('message', function(event, data) {
        if( !data )
            return;

        //append at beginning new message
        logger.debug('New message:', data);
        self.messages.unshift(data);
    });

};
Cleep.controller('monitoringController', ['$rootScope', '$scope', 'cleepService', 'logger', monitoringController]);
