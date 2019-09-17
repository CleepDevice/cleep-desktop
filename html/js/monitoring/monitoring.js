/**
 * Monitoring controller
 * Display messages from all devices received on bus
 */
var monitoringController = function(monitoringService) {
    var self = this;
    self.monitoring = monitoringService;
};

var Cleep = angular.module('Cleep');
Cleep.controller('monitoringController', ['monitoringService', monitoringController]);
