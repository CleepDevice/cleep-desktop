var Cleep = angular.module('Cleep');

/**
 * Monitoring controller
 * Display messages from all devices received on bus
 */
var monitoringController = function($rootScope, $scope, cleepService, deviceMessages)
{
    var self = this;
    self.messages = deviceMessages
};
Cleep.controller('monitoringController', ['$rootScope', '$scope', 'cleepService', 'deviceMessages', monitoringController]);
